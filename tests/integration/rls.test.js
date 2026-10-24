// Integration tests for the Row Level Security policies in schema.sql -
// the access control the README calls "not optional" (only the owner can
// edit/delete their project, drafts are private, you can only
// follow/unfollow as yourself, etc). These can only be verified against a
// real Postgres, since RLS is enforced by the database, not by any of the
// JS in js/.
//
// Requires a local Postgres reachable at TEST_DATABASE_URL (defaults to
// postgres://postgres:postgres@127.0.0.1:5432/postgres, matching the
// service container the tests.yml workflow spins up in CI). If it can't
// connect, every test here is skipped with an explanation rather than
// failing the whole suite - see the README's "Tests" section.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { parseAchievements, parseShopItems } from '../helpers/catalogs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ADMIN_URL = process.env.TEST_DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/postgres';
const DB_NAME = 'showcase_rls_test';

function withDatabase(url, dbName) {
  const parsed = new URL(url);
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
}

let client = null;
let unavailableReason = null;

async function trySetUp() {
  let admin;
  try {
    admin = new pg.Client({ connectionString: ADMIN_URL });
    await admin.connect();
  } catch (err) {
    return `could not reach Postgres at ${ADMIN_URL} (${err.message})`;
  }

  try {
    await admin.query(`drop database if exists ${DB_NAME}`);
    await admin.query(`create database ${DB_NAME}`);
  } finally {
    await admin.end();
  }

  const db = new pg.Client({ connectionString: withDatabase(ADMIN_URL, DB_NAME) });
  await db.connect();
  try {
    await db.query(readFileSync(path.join(__dirname, 'sql/stub-supabase.sql'), 'utf8'));
    await db.query(readFileSync(path.join(__dirname, '../../schema.sql'), 'utf8'));
  } catch (err) {
    await db.end();
    throw err;
  }
  client = db;
  return null;
}

unavailableReason = await trySetUp().catch((err) => `setup failed: ${err.stack || err.message}`);

// Without this, an unclosed connection keeps the event loop alive and
// `node --test`/`npm test` never exits on its own.
after(async () => {
  if (client) await client.end();
});

// --- helpers ---------------------------------------------------------
// Every test runs inside its own transaction (fixtures included) that
// gets rolled back at the end, so tests never see each other's data and
// nothing needs cleaning up between them.

async function begin() {
  await client.query('begin');
}

async function rollback() {
  await client.query('rollback');
}

// Postgres aborts the whole transaction after any error, not just the
// failing statement - so an expected rejection needs its own savepoint,
// or every query the rest of the test makes fails with "current
// transaction is aborted".
async function expectRejects(queryThunk, pattern, message) {
  await client.query('savepoint expect_reject');
  await assert.rejects(queryThunk(), pattern, message);
  await client.query('rollback to savepoint expect_reject');
}

// Switches the rest of the current transaction to run as a signed-in
// user, the way PostgREST would for a request carrying that user's JWT.
async function asUser(uid) {
  await client.query('set local role authenticated');
  await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid })]);
}

async function asAnon() {
  await client.query('set local role anon');
}

function uuid() {
  return crypto.randomUUID();
}

// Fixture helper: inserts an auth.users row (which the on_auth_user_created
// trigger turns into a public.profiles row) as the superuser connection,
// bypassing RLS the way only Supabase's own auth server normally can.
//
// birthDate travels in the signup metadata, the way both clients send it,
// and defaults to an adult's: an account with no date of birth cannot write
// at all (see consent_ok() in schema.sql). Pass null for one that never
// gave a date.
async function makeUser({
  email = `${uuid()}@example.com`,
  displayName = null,
  admin = false,
  birthDate = '1990-01-01',
  db = client,
} = {}) {
  const id = uuid();
  const meta = {};
  if (displayName) meta.display_name = displayName;
  if (birthDate) meta.birth_date = birthDate;
  await db.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [id, email, meta]);
  if (admin) {
    await db.query('update public.profiles set is_admin = true where id = $1', [id]);
  }
  return id;
}

// A date of birth that makes the holder `years` old today.
function birthDateYearsAgo(years) {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function makeProject(userId, { published = true, title = 'Test Project' } = {}) {
  const { rows } = await client.query(
    'insert into public.projects (user_id, title, published) values ($1, $2, $3) returning id',
    [userId, title, published],
  );
  return rows[0].id;
}

function itRls(name, fn) {
  const options = unavailableReason ? { skip: unavailableReason } : {};
  test(name, options, async () => {
    await begin();
    try {
      await fn();
    } finally {
      await rollback();
    }
  });
}

// --- projects ----------------------------------------------------------

itRls('drafts are only visible to their owner, not other users or signed-out visitors', async () => {
  const owner = await makeUser();
  const other = await makeUser();
  const draftId = await makeProject(owner, { published: false });

  await asUser(owner);
  assert.equal((await client.query('select 1 from public.projects where id = $1', [draftId])).rowCount, 1);

  await asUser(other);
  assert.equal((await client.query('select 1 from public.projects where id = $1', [draftId])).rowCount, 0);

  await asAnon();
  assert.equal((await client.query('select 1 from public.projects where id = $1', [draftId])).rowCount, 0);
});

itRls('published projects are visible to anyone', async () => {
  const owner = await makeUser();
  const projectId = await makeProject(owner, { published: true });

  await asAnon();
  assert.equal((await client.query('select 1 from public.projects where id = $1', [projectId])).rowCount, 1);
});

itRls('users can only create projects owned by themselves', async () => {
  const me = await makeUser();
  const someoneElse = await makeUser();

  await asUser(me);
  await assert.doesNotReject(
    client.query('insert into public.projects (user_id, title) values ($1, $2)', [me, 'Mine']),
  );
  await expectRejects(
    () => client.query('insert into public.projects (user_id, title) values ($1, $2)', [someoneElse, 'Not mine']),
    /row-level security/,
  );
});

itRls('only the owner can update their project, and cannot reassign ownership', async () => {
  const owner = await makeUser();
  const intruder = await makeUser();
  const projectId = await makeProject(owner, { title: 'Original' });

  await asUser(intruder);
  const blocked = await client.query('update public.projects set title = $1 where id = $2', ['Hacked', projectId]);
  assert.equal(blocked.rowCount, 0);

  await asUser(owner);
  const allowed = await client.query('update public.projects set title = $1 where id = $2', ['Renamed', projectId]);
  assert.equal(allowed.rowCount, 1);

  await expectRejects(
    () => client.query('update public.projects set user_id = $1 where id = $2', [intruder, projectId]),
    /row-level security/,
  );
});

itRls('only the owner can delete their project', async () => {
  const owner = await makeUser();
  const intruder = await makeUser();
  const projectId = await makeProject(owner);

  await asUser(intruder);
  assert.equal((await client.query('delete from public.projects where id = $1', [projectId])).rowCount, 0);

  await asUser(owner);
  assert.equal((await client.query('delete from public.projects where id = $1', [projectId])).rowCount, 1);
});

itRls('views_count and author_name cannot be set by the client, on insert or update', async () => {
  const owner = await makeUser({ displayName: 'Alice' });

  await asUser(owner);
  const inserted = await client.query(
    `insert into public.projects (user_id, title, views_count, author_name)
     values ($1, 'Mine', 9999, 'Not Alice') returning views_count, author_name`,
    [owner],
  );
  assert.equal(inserted.rows[0].views_count, 0);
  assert.equal(inserted.rows[0].author_name, 'Alice');

  const { rows } = await client.query(
    `update public.projects set views_count = 42 where user_id = $1 returning views_count`,
    [owner],
  );
  assert.equal(rows[0].views_count, 0);
});

// --- profiles ------------------------------------------------------------

itRls('profiles are publicly readable but only editable by their owner', async () => {
  const owner = await makeUser({ displayName: 'Owner' });
  const intruder = await makeUser();

  await asAnon();
  assert.equal((await client.query('select 1 from public.profiles where id = $1', [owner])).rowCount, 1);

  await asUser(intruder);
  const blocked = await client.query('update public.profiles set display_name = $1 where id = $2', ['Hacked', owner]);
  assert.equal(blocked.rowCount, 0);

  await asUser(owner);
  const allowed = await client.query('update public.profiles set display_name = $1 where id = $2', ['Renamed', owner]);
  assert.equal(allowed.rowCount, 1);
});

// --- follows ---------------------------------------------------------------

itRls('you can only follow/unfollow as yourself, and cannot self-follow', async () => {
  const me = await makeUser();
  const target = await makeUser();

  await asUser(me);
  await assert.doesNotReject(
    client.query('insert into public.follows (follower_id, following_id) values ($1, $2)', [me, target]),
  );

  await expectRejects(
    () => client.query('insert into public.follows (follower_id, following_id) values ($1, $2)', [target, me]),
    /row-level security/,
    'inserting a follow row as someone else should be rejected',
  );

  await expectRejects(
    () => client.query('insert into public.follows (follower_id, following_id) values ($1, $1)', [me]),
    /check/i,
    'following yourself should violate the check constraint',
  );

  await asUser(target);
  assert.equal(
    (await client.query('delete from public.follows where follower_id = $1 and following_id = $2', [me, target]))
      .rowCount,
    0,
    "the followed user shouldn't be able to remove someone else's follow",
  );

  await asUser(me);
  assert.equal(
    (await client.query('delete from public.follows where follower_id = $1 and following_id = $2', [me, target]))
      .rowCount,
    1,
  );
});

// --- comments ----------------------------------------------------------

itRls('a comment can be deleted by its author, the project owner, or an admin - nobody else', async () => {
  const owner = await makeUser();
  const commenter = await makeUser();
  const bystander = await makeUser();
  const admin = await makeUser({ admin: true });
  const projectId = await makeProject(owner);

  async function postComment() {
    await asUser(commenter);
    const { rows } = await client.query(
      'insert into public.comments (project_id, user_id, body) values ($1, $2, $3) returning id',
      [projectId, commenter, 'nice project'],
    );
    return rows[0].id;
  }

  await asUser(commenter);
  await expectRejects(
    () =>
      client.query('insert into public.comments (project_id, user_id, body) values ($1, $2, $3)', [
        projectId,
        owner,
        'posting as someone else',
      ]),
    /row-level security/,
  );

  let commentId = await postComment();
  await asUser(bystander);
  assert.equal((await client.query('delete from public.comments where id = $1', [commentId])).rowCount, 0);

  await asUser(commenter);
  assert.equal((await client.query('delete from public.comments where id = $1', [commentId])).rowCount, 1);

  commentId = await postComment();
  await asUser(owner);
  assert.equal(
    (await client.query('delete from public.comments where id = $1', [commentId])).rowCount,
    1,
    'the project owner should be able to moderate comments on their own project',
  );

  commentId = await postComment();
  await asUser(admin);
  assert.equal(
    (await client.query('delete from public.comments where id = $1', [commentId])).rowCount,
    1,
    'an admin should be able to delete any comment',
  );
});

// --- likes -----------------------------------------------------------------

itRls("liking your own project is rejected; liking someone else's works, unliking is self-only", async () => {
  const owner = await makeUser();
  const liker = await makeUser();
  const bystander = await makeUser();
  const projectId = await makeProject(owner);

  await asUser(owner);
  await expectRejects(
    () => client.query('insert into public.likes (project_id, user_id) values ($1, $2)', [projectId, owner]),
    /row-level security/,
    "an owner liking their own project should be rejected (it's free points otherwise)",
  );

  await asUser(liker);
  await assert.doesNotReject(
    client.query('insert into public.likes (project_id, user_id) values ($1, $2)', [projectId, liker]),
  );

  await asUser(bystander);
  assert.equal(
    (await client.query('delete from public.likes where project_id = $1 and user_id = $2', [projectId, liker]))
      .rowCount,
    0,
  );

  await asUser(liker);
  assert.equal(
    (await client.query('delete from public.likes where project_id = $1 and user_id = $2', [projectId, liker]))
      .rowCount,
    1,
  );
});

// --- log_project_view() RPC --------------------------------------------

itRls('log_project_view ignores self-views and dedupes the same viewer within 6 hours', async () => {
  const owner = await makeUser();
  const viewer = await makeUser();
  const projectId = await makeProject(owner);

  await asUser(owner);
  let counted = await client.query('select public.log_project_view($1) as counted', [projectId]);
  assert.equal(counted.rows[0].counted, false, "an owner viewing their own project shouldn't count");

  await asUser(viewer);
  counted = await client.query('select public.log_project_view($1) as counted', [projectId]);
  assert.equal(counted.rows[0].counted, true);

  counted = await client.query('select public.log_project_view($1) as counted', [projectId]);
  assert.equal(counted.rows[0].counted, false, 'the same viewer viewing again right away should be deduped');

  const { rows } = await client.query('select views_count from public.projects where id = $1', [projectId]);
  assert.equal(rows[0].views_count, 1);
});

// --- claim_achievement() RPC ---------------------------------------------

itRls('claim_achievement pays out its reward exactly once, even if claimed twice', async () => {
  const me = await makeUser();
  const someone = await makeUser();
  await client.query(
    "insert into public.achievement_defs (id, metric, threshold, reward) values ('test-ach', 'following_count', 1, 50)",
  );
  await client.query('insert into public.follows (follower_id, following_id) values ($1, $2)', [me, someone]);

  await asUser(me);
  const first = await client.query("select public.claim_achievement('test-ach') as points");
  assert.equal(first.rows[0].points, 50);

  const second = await client.query("select public.claim_achievement('test-ach') as points");
  assert.equal(second.rows[0].points, 50, 'a second claim must not pay the reward again');
});

// --- purchase_item() RPC -------------------------------------------------

itRls('purchase_item rejects insufficient points and never double-charges a repeat purchase', async () => {
  const poor = await makeUser();
  const buyer = await makeUser();
  await client.query("insert into public.shop_item_defs (id, price) values ('test-item', 100)");
  await client.query('update public.profiles set points = 150 where id = $1', [buyer]);

  await asUser(poor);
  await expectRejects(() => client.query("select public.purchase_item('test-item')"), /Not enough points/);

  await asUser(buyer);
  const first = await client.query("select public.purchase_item('test-item') as points");
  assert.equal(first.rows[0].points, 50);

  const second = await client.query("select public.purchase_item('test-item') as points");
  assert.equal(second.rows[0].points, 50, 'buying an already-owned item again must not charge twice');
});

// --- age and parental consent ---------------------------------------------

itRls('an account with no date of birth can read but not write, until it gives one', async () => {
  const owner = await makeUser();
  const projectId = await makeProject(owner);
  const noDate = await makeUser({ birthDate: null });

  await asUser(noDate);
  assert.equal((await client.query('select 1 from public.projects where id = $1', [projectId])).rowCount, 1);
  await expectRejects(
    () => client.query('insert into public.likes (project_id, user_id) values ($1, $2)', [projectId, noDate]),
    /row-level security/,
    'signing up without a birth_date must not get round the age rules',
  );

  const { rows } = await client.query("select public.set_birth_date('1990-01-01') as state");
  assert.equal(rows[0].state, 'not_required');
  await assert.doesNotReject(
    client.query('insert into public.likes (project_id, user_id) values ($1, $2)', [projectId, noDate]),
  );
});

itRls('an account from before ages were asked for (no row at all) has to give a date too', async () => {
  const owner = await makeUser();
  const projectId = await makeProject(owner);
  const legacy = await makeUser({ birthDate: null });
  await client.query('delete from public.account_ages where user_id = $1', [legacy]);

  await asUser(legacy);
  await expectRejects(
    () => client.query('insert into public.likes (project_id, user_id) values ($1, $2)', [projectId, legacy]),
    /row-level security/,
  );

  await client.query("select public.set_birth_date('1990-01-01')");
  await assert.doesNotReject(
    client.query('insert into public.likes (project_id, user_id) values ($1, $2)', [projectId, legacy]),
  );
});

itRls('a 13-15 year old waiting on a parent cannot write; a 16 year old can', async () => {
  const owner = await makeUser();
  const projectId = await makeProject(owner);
  const young = await makeUser({ birthDate: birthDateYearsAgo(14) });
  const sixteen = await makeUser({ birthDate: birthDateYearsAgo(16) });

  await asUser(young);
  await expectRejects(
    () => client.query('insert into public.likes (project_id, user_id) values ($1, $2)', [projectId, young]),
    /row-level security/,
  );

  await asUser(sixteen);
  await assert.doesNotReject(
    client.query('insert into public.likes (project_id, user_id) values ($1, $2)', [projectId, sixteen]),
  );
});

// --- notifications -----------------------------------------------------------

itRls('notifications cannot be forged by calling add_notification directly', async () => {
  const victim = await makeUser();
  const someone = await makeUser();

  await asUser(someone);
  await expectRejects(
    () => client.query("select public.add_notification($1, $2, 'follow')", [victim, someone]),
    /permission denied/,
    'a signed-in user must not be able to hand anyone a notification',
  );
  await asAnon();
  await expectRejects(
    () => client.query("select public.add_notification($1, $2, 'follow')", [victim, someone]),
    /permission denied/,
  );

  // A real follow still notifies, through the trigger.
  await asUser(someone);
  await client.query('insert into public.follows (follower_id, following_id) values ($1, $2)', [someone, victim]);
  await asUser(victim);
  const { rows } = await client.query("select count(*)::int as n from public.notifications where type = 'follow'");
  assert.equal(rows[0].n, 1);
});

// --- created_at --------------------------------------------------------------
// now() is the transaction's start time, so a row the server dated itself
// compares equal to it exactly.

itRls('clients cannot backdate or future-date what they write, nor re-date it later', async () => {
  const me = await makeUser();
  const other = await makeUser();
  const projectId = await makeProject(other);

  await asUser(me);
  const entry = await client.query(
    "insert into public.projects (user_id, title, created_at) values ($1, 'Dated', '2099-01-01') returning created_at = now() as pinned",
    [me],
  );
  assert.equal(entry.rows[0].pinned, true, 'a future date would pin an entry to the top of Latest');

  const redated = await client.query(
    "update public.projects set created_at = '2099-01-01' where user_id = $1 returning created_at = now() as pinned",
    [me],
  );
  assert.equal(redated.rows[0].pinned, true);

  for (const [sql, params] of [
    ["insert into public.comments (project_id, user_id, body, created_at) values ($1, $2, 'hi', '2000-01-01')", [projectId, me]],
    ["insert into public.likes (project_id, user_id, created_at) values ($1, $2, '2000-01-01')", [projectId, me]],
    ["insert into public.follows (follower_id, following_id, created_at) values ($1, $2, '2000-01-01')", [me, other]],
    ["insert into public.saves (user_id, project_id, created_at) values ($1, $2, '2000-01-01')", [me, projectId]],
  ]) {
    const { rows } = await client.query(`${sql} returning created_at = now() as pinned`, params);
    assert.equal(rows[0].pinned, true, `${sql.split(' ')[2]} must be dated by the server`);
  }
});

itRls('backdating rows does not get round the rate limits', async () => {
  const owner = await makeUser();
  const me = await makeUser();
  const projectId = await makeProject(owner);

  await asUser(me);
  for (let i = 0; i < 20; i++) {
    await client.query(
      "insert into public.comments (project_id, user_id, body, created_at) values ($1, $2, $3, '2000-01-01')",
      [projectId, me, `comment ${i}`],
    );
  }
  await expectRejects(
    () =>
      client.query(
        "insert into public.comments (project_id, user_id, body, created_at) values ($1, $2, 'one more', '2000-01-01')",
        [projectId, me],
      ),
    /Slow down/,
  );
});

itRls("an account's age cannot be faked by moving profiles.created_at", async () => {
  const me = await makeUser();
  await client.query(
    "insert into public.achievement_defs (id, metric, threshold, reward) values ('test-old', 'account_age_days', 365, 50)",
  );

  await asUser(me);
  await client.query("update public.profiles set created_at = now() - interval '800 days' where id = $1", [me]);
  const { rows } = await client.query('select created_at = now() as unchanged from public.profiles where id = $1', [me]);
  assert.equal(rows[0].unchanged, true);
  await expectRejects(() => client.query("select public.claim_achievement('test-old')"), /not yet earned/);
});

// --- spending under concurrency --------------------------------------------
// These need a second connection racing the first, which one rolled-back
// transaction cannot give. Their fixtures are committed instead - harmless,
// since the whole database is a scratch copy recreated on every run - and
// each racer holds its own connection and transaction.

function itRace(name, fn) {
  const options = unavailableReason ? { skip: unavailableReason } : {};
  test(name, options, fn);
}

async function connectAsUser(uid) {
  const c = new pg.Client({ connectionString: withDatabase(ADMIN_URL, DB_NAME) });
  await c.connect();
  await c.query('begin');
  await c.query('set local role authenticated');
  await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid })]);
  return c;
}

// Resolves once the backend `pid` is waiting on a lock, so the race is set
// up the same way on every run rather than depending on timing.
async function waitUntilBlocked(pid) {
  for (let i = 0; i < 250; i++) {
    const { rows } = await client.query('select wait_event_type from pg_stat_activity where pid = $1', [pid]);
    if (rows[0] && rows[0].wait_event_type === 'Lock') return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('the second call never waited on the first');
}

// Starts `sql` on `second` while `first` still holds its transaction open,
// waits until it is blocked behind it, then lets `first` commit.
async function race(first, second, sql, params = []) {
  const pid = (await second.query('select pg_backend_pid() as pid')).rows[0].pid;
  const racing = second.query(sql, params);
  racing.catch(() => {}); // observed by the caller; this only stops an unhandled-rejection warning
  await waitUntilBlocked(pid);
  await first.query('commit');
  return racing;
}

itRace('two purchases fired at once cannot spend the same points twice', async () => {
  const buyer = await makeUser();
  const tag = uuid().slice(0, 8);
  await client.query('insert into public.shop_item_defs (id, price) values ($1, 100), ($2, 100)', [
    `race-a-${tag}`,
    `race-b-${tag}`,
  ]);
  await client.query('update public.profiles set points = 100 where id = $1', [buyer]);

  const first = await connectAsUser(buyer);
  const second = await connectAsUser(buyer);
  try {
    await first.query('select public.purchase_item($1)', [`race-a-${tag}`]);
    await assert.rejects(
      race(first, second, 'select public.purchase_item($1)', [`race-b-${tag}`]),
      /Not enough points/,
      'the second purchase has to see the balance the first one left',
    );
    await second.query('rollback');
  } finally {
    await first.end();
    await second.end();
  }

  const { rows } = await client.query('select points from public.profiles where id = $1', [buyer]);
  assert.equal(rows[0].points, 0, 'a balance must never be driven below zero');
});

itRace('two collects fired at once pay the same earnings out once', async () => {
  const earner = await makeUser();
  const fan = await makeUser();
  // One follower is worth 10 lifetime points (see user_reputation).
  await client.query('insert into public.follows (follower_id, following_id) values ($1, $2)', [fan, earner]);

  const first = await connectAsUser(earner);
  const second = await connectAsUser(earner);
  try {
    await first.query('select public.collect_earnings()');
    const { rows } = await race(first, second, 'select public.collect_earnings() as result');
    assert.equal(rows[0].result.paid, 0, 'the second collect has to see what the first one already paid');
    await second.query('commit');
  } finally {
    await first.end();
    await second.end();
  }

  const { rows } = await client.query('select points, points_earned_total from public.profiles where id = $1', [earner]);
  assert.deepEqual(rows[0], { points: 10, points_earned_total: 10 });
});

// --- announcements -----------------------------------------------------

async function makeAnnouncement(adminId, { title = 'Notice', active = true, expiresAt = null, attachments = [] } = {}) {
  const { rows } = await client.query(
    'insert into public.announcements (title, body, created_by, active, expires_at, attachments) values ($1, $2, $3, $4, $5, $6) returning id',
    [title, 'Body', adminId, active, expiresAt, JSON.stringify(attachments)],
  );
  return rows[0].id;
}

itRls('only an admin can publish, change or remove announcements', async () => {
  const admin = await makeUser({ admin: true });
  const user = await makeUser();

  await asUser(admin);
  await assert.doesNotReject(
    client.query('insert into public.announcements (title, body, created_by) values ($1, $2, $3)', ['Hi', 'There', admin]),
  );

  await asUser(user);
  await expectRejects(
    () => client.query('insert into public.announcements (title, body, created_by) values ($1, $2, $3)', ['Hi', 'There', user]),
    /row-level security/,
  );
  // Posing as the admin does not help: created_by has to be the caller.
  await expectRejects(
    () => client.query('insert into public.announcements (title, body, created_by) values ($1, $2, $3)', ['Hi', 'There', admin]),
    /row-level security/,
  );
  assert.equal((await client.query('update public.announcements set active = false')).rowCount, 0);
  assert.equal((await client.query('delete from public.announcements')).rowCount, 0);
});

itRls('everyone can read a live announcement, but nobody but admins sees withdrawn or expired ones', async () => {
  const admin = await makeUser({ admin: true });
  const user = await makeUser();
  await makeAnnouncement(admin, { title: 'live' });
  await makeAnnouncement(admin, { title: 'withdrawn', active: false });
  await makeAnnouncement(admin, { title: 'expired', expiresAt: new Date(Date.now() - 3600 * 1000) });
  await makeAnnouncement(admin, { title: 'later', expiresAt: new Date(Date.now() + 3600 * 1000) });

  const titles = async () =>
    (await client.query('select title from public.announcements order by title')).rows.map((r) => r.title);

  await asAnon();
  assert.deepEqual(await titles(), ['later', 'live']);
  await asUser(user);
  assert.deepEqual(await titles(), ['later', 'live']);
  await asUser(admin);
  assert.deepEqual(await titles(), ['expired', 'later', 'live', 'withdrawn']);
});

itRls('an announcement needs a title, a body within the limit and a list of attachments', async () => {
  const admin = await makeUser({ admin: true });
  await asUser(admin);
  await expectRejects(
    () => client.query('insert into public.announcements (title, body, created_by) values ($1, $2, $3)', ['', 'x', admin]),
    /check constraint/,
  );
  await expectRejects(
    () => client.query('insert into public.announcements (title, body, created_by) values ($1, $2, $3)', ['t', 'x'.repeat(4001), admin]),
    /check constraint/,
  );
  await expectRejects(
    () => client.query("insert into public.announcements (title, body, created_by, attachments) values ('t', 'x', $1, '{}'::jsonb)", [admin]),
    /check constraint/,
  );
});

itRls('only an admin can add, replace or remove files in the announcements bucket', async () => {
  const admin = await makeUser({ admin: true });
  const user = await makeUser();

  await asUser(admin);
  await assert.doesNotReject(
    client.query("insert into storage.objects (bucket_id, name, owner) values ('announcements', 'a/one.bin', $1)", [admin]),
  );
  await assert.doesNotReject(
    client.query("update storage.objects set name = 'a/two.bin' where bucket_id = 'announcements'"),
  );

  await asUser(user);
  await expectRejects(
    () => client.query("insert into storage.objects (bucket_id, name, owner) values ('announcements', 'u/x.bin', $1)", [user]),
    /row-level security/,
  );
  assert.equal((await client.query("update storage.objects set name = 'u/y.bin' where bucket_id = 'announcements'")).rowCount, 0);
  assert.equal((await client.query("delete from storage.objects where bucket_id = 'announcements'")).rowCount, 0);
});

// --- project updates ---------------------------------------------------

itRls("only a project's owner can post an update to it, and only as themselves", async () => {
  const owner = await makeUser();
  const other = await makeUser();
  const projectId = await makeProject(owner);

  await asUser(owner);
  await assert.doesNotReject(
    client.query("insert into public.project_updates (project_id, user_id, version, body) values ($1, $2, 'v1', 'first')", [projectId, owner]),
  );

  await asUser(other);
  await expectRejects(
    () => client.query("insert into public.project_updates (project_id, user_id, body) values ($1, $2, 'mine')", [projectId, other]),
    /row-level security/,
    'someone else posted on a project that is not theirs',
  );
  await expectRejects(
    () => client.query("insert into public.project_updates (project_id, user_id, body) values ($1, $2, 'as owner')", [projectId, owner]),
    /row-level security/,
    'someone posted an update as the owner',
  );
});

itRls('updates are readable with their project, and a draft keeps its updates private', async () => {
  const owner = await makeUser();
  const published = await makeProject(owner, { published: true });
  const draft = await makeProject(owner, { published: false });
  await client.query("insert into public.project_updates (project_id, user_id, body) values ($1, $2, 'a'), ($3, $2, 'b')", [published, owner, draft]);

  await asAnon();
  const { rows } = await client.query('select project_id from public.project_updates');
  assert.deepEqual(rows.map((r) => r.project_id), [published]);
});

itRls('an update can be removed by its author or an admin, not by anyone else', async () => {
  const owner = await makeUser();
  const other = await makeUser();
  const admin = await makeUser({ admin: true });
  const projectId = await makeProject(owner);
  await client.query("insert into public.project_updates (project_id, user_id, body) values ($1, $2, 'x')", [projectId, owner]);

  await asUser(other);
  assert.equal((await client.query('delete from public.project_updates')).rowCount, 0);
  await asUser(admin);
  assert.equal((await client.query('delete from public.project_updates')).rowCount, 1);
});

itRls('an update is dated by the server and posting is rate limited', async () => {
  const owner = await makeUser();
  const projectId = await makeProject(owner);

  await asUser(owner);
  await client.query("insert into public.project_updates (project_id, user_id, body, created_at) values ($1, $2, 'old', '2020-01-01')", [projectId, owner]);
  const { rows } = await client.query("select 1 from public.project_updates where created_at < '2021-01-01'");
  assert.equal(rows.length, 0, 'a client chose the date of its own update');

  for (let i = 0; i < 9; i++) {
    await client.query("insert into public.project_updates (project_id, user_id, body) values ($1, $2, 'n')", [projectId, owner]);
  }
  await expectRejects(
    () => client.query("insert into public.project_updates (project_id, user_id, body) values ($1, $2, 'n')", [projectId, owner]),
    /Slow down/,
  );
});

itRls('releases add XP once per project per day and stop counting after twenty', async () => {
  const owner = await makeUser();
  const projectId = await makeProject(owner);
  const xp = async () => (await client.query('select xp, releases from public.user_reputation where user_id = $1', [owner])).rows[0];
  const base = (await xp()).xp;

  // Three updates on one day are one release.
  await client.query("insert into public.project_updates (project_id, user_id, body) values ($1, $2, 'a'), ($1, $2, 'b'), ($1, $2, 'c')", [projectId, owner]);
  assert.deepEqual(await xp(), { xp: base + 10, releases: 1 });

  // Forty more days: only the first twenty releases pay.
  for (let d = 1; d <= 40; d++) {
    await client.query(
      "insert into public.project_updates (project_id, user_id, body, created_at) values ($1, $2, 'n', now() - ($3 || ' days')::interval)",
      [projectId, owner, String(d)],
    );
  }
  const after = await xp();
  assert.equal(after.releases, 41);
  assert.equal(after.xp, base + 200);
});

// Back to the connection's own role (the superuser that makes fixtures),
// after asUser()/asAnon() earlier in the same transaction.
async function asSuperuser() {
  await client.query('reset role');
  await client.query("select set_config('request.jwt.claims', '', true)");
}

// --- uploads ------------------------------------------------------------

itRls('a signed-in person can upload into their own folder, and only there', async () => {
  const me = await makeUser();
  const other = await makeUser();

  await asUser(me);
  await assert.doesNotReject(
    client.query("insert into storage.objects (bucket_id, name, owner) values ('uploads', $1, $2)", [`${me}/one.webp`, me]),
  );
  await expectRejects(
    () => client.query("insert into storage.objects (bucket_id, name, owner) values ('uploads', $1, $2)", [`${other}/x.webp`, me]),
    /row-level security/,
  );
});

itRls('uploads stop at 300 files a person', async () => {
  const me = await makeUser();
  await client.query(
    "insert into storage.objects (bucket_id, name, owner) select 'uploads', $1 || '/' || g || '.webp', $1::uuid from generate_series(1, 299) g",
    [me],
  );

  await asUser(me);
  await assert.doesNotReject(
    client.query("insert into storage.objects (bucket_id, name, owner) values ('uploads', $1, $2)", [`${me}/300.webp`, me]),
  );
  await expectRejects(
    () => client.query("insert into storage.objects (bucket_id, name, owner) values ('uploads', $1, $2)", [`${me}/301.webp`, me]),
    /row-level security/,
  );
});

// The audio guide shares the project. Its select policy holds a subquery,
// which used to make the uploads policy's own count recurse and fail every
// insert into storage.objects for everyone.
itRls("the audio guide's editors can change its bucket, and nobody else can", async () => {
  const editor = await makeUser();
  const user = await makeUser();
  await client.query("insert into public.user_ranks (user_id, rank) values ($1, 'guide_editor')", [editor]);

  await asUser(editor);
  await assert.doesNotReject(
    client.query("insert into storage.objects (bucket_id, name) values ('przewodnik', 'routes/a.json')"),
  );
  assert.equal((await client.query("select 1 from storage.objects where bucket_id = 'przewodnik'")).rowCount, 1);

  await asUser(user);
  await expectRejects(
    () => client.query("insert into storage.objects (bucket_id, name) values ('przewodnik', 'routes/b.json')"),
    /row-level security/,
  );
  assert.equal((await client.query("delete from storage.objects where bucket_id = 'przewodnik'")).rowCount, 0);
  assert.equal((await client.query('select public.has_rank($1) as r', ['guide_editor'])).rows[0].r, false);
});

itRls('only an admin can grant or revoke a rank', async () => {
  const admin = await makeUser({ admin: true });
  const user = await makeUser();

  await asUser(user);
  await expectRejects(() => client.query("select public.admin_grant_rank($1, 'guide_editor')", [user]), /Admin access required/);

  await asUser(admin);
  await client.query("select public.admin_grant_rank($1, 'guide_editor')", [user]);
  await asUser(user);
  assert.equal((await client.query("select public.has_rank('guide_editor') as r")).rows[0].r, true);

  await asUser(admin);
  await client.query("select public.admin_revoke_rank($1, 'guide_editor')", [user]);
  await asUser(user);
  assert.equal((await client.query("select public.has_rank('guide_editor') as r")).rows[0].r, false);
});

// --- counters on the project row ----------------------------------------

itRls('likes_count and comments_count follow the rows, and no client can set them', async () => {
  const owner = await makeUser();
  const fan = await makeUser();
  const projectId = await makeProject(owner);
  const counts = async () =>
    (await client.query('select likes_count, comments_count from public.projects where id = $1', [projectId])).rows[0];

  await asUser(fan);
  await client.query('insert into public.likes (project_id, user_id) values ($1, $2)', [projectId, fan]);
  await client.query("insert into public.comments (project_id, user_id, body) values ($1, $2, 'a'), ($1, $2, 'b')", [projectId, fan]);
  assert.deepEqual(await counts(), { likes_count: 1, comments_count: 2 });

  await client.query('delete from public.likes where project_id = $1 and user_id = $2', [projectId, fan]);
  await client.query("delete from public.comments where project_id = $1 and body = 'a'", [projectId]);
  assert.deepEqual(await counts(), { likes_count: 0, comments_count: 1 });

  await asUser(owner);
  const { rows } = await client.query(
    'update public.projects set likes_count = 999, comments_count = 999 where id = $1 returning likes_count, comments_count',
    [projectId],
  );
  assert.deepEqual(rows[0], { likes_count: 0, comments_count: 1 });
  const inserted = await client.query(
    "insert into public.projects (user_id, title, likes_count, comments_count) values ($1, 'Fresh', 50, 50) returning likes_count, comments_count",
    [owner],
  );
  assert.deepEqual(inserted.rows[0], { likes_count: 0, comments_count: 0 });
});

itRls('a like, a comment or a view is not an edit: updated_at stays put', async () => {
  const owner = await makeUser();
  const fan = await makeUser();
  const projectId = await makeProject(owner);
  const updatedAt = async () =>
    (await client.query("select updated_at = '2020-01-01'::timestamptz as same from public.projects where id = $1", [projectId])).rows[0].same;
  // Backdated with the trigger off, since the trigger owns this column.
  await client.query('alter table public.projects disable trigger projects_set_updated_at');
  await client.query("update public.projects set updated_at = '2020-01-01' where id = $1", [projectId]);
  await client.query('alter table public.projects enable trigger projects_set_updated_at');

  await asUser(fan);
  await client.query('insert into public.likes (project_id, user_id) values ($1, $2)', [projectId, fan]);
  await client.query("insert into public.comments (project_id, user_id, body) values ($1, $2, 'hi')", [projectId, fan]);
  await client.query('select public.log_project_view($1)', [projectId]);
  assert.equal(await updatedAt(), true);

  await asUser(owner);
  await client.query("update public.projects set title = 'Edited' where id = $1", [projectId]);
  assert.equal(await updatedAt(), false);
});

itRls('the latest update view shows the newest update per project, and hides drafts from others', async () => {
  const owner = await makeUser();
  const other = await makeUser();
  const live = await makeProject(owner);
  const draft = await makeProject(owner, { published: false });
  await client.query(
    "insert into public.project_updates (project_id, user_id, version, body, created_at) values ($1, $3, 'v1', 'old', now() - interval '2 days'), ($1, $3, 'v2', 'new', now()), ($2, $3, 'd1', 'secret', now())",
    [live, draft, owner],
  );

  await asUser(other);
  const { rows } = await client.query('select project_id, version from public.project_latest_updates where project_id = any($1)', [[live, draft]]);
  assert.deepEqual(rows, [{ project_id: live, version: 'v2' }]);

  await asUser(owner);
  assert.equal((await client.query('select 1 from public.project_latest_updates where project_id = $1', [draft])).rowCount, 1);
});

// --- rate limits that undoing does not reset ----------------------------

itRls('liking and unliking in a loop still runs into the rate limit', async () => {
  const owner = await makeUser();
  const me = await makeUser();
  const projectId = await makeProject(owner);

  await asUser(me);
  for (let i = 0; i < 120; i++) {
    await client.query('insert into public.likes (project_id, user_id) values ($1, $2)', [projectId, me]);
    await client.query('delete from public.likes where project_id = $1 and user_id = $2', [projectId, me]);
  }
  await expectRejects(
    () => client.query('insert into public.likes (project_id, user_id) values ($1, $2)', [projectId, me]),
    /Slow down/,
  );
});

itRls('following and unfollowing in a loop still runs into the rate limit', async () => {
  const me = await makeUser();
  const them = await makeUser();

  await asUser(me);
  for (let i = 0; i < 60; i++) {
    await client.query('insert into public.follows (follower_id, following_id) values ($1, $2)', [me, them]);
    await client.query('delete from public.follows where follower_id = $1 and following_id = $2', [me, them]);
  }
  await expectRejects(
    () => client.query('insert into public.follows (follower_id, following_id) values ($1, $2)', [me, them]),
    /Slow down/,
  );
});

itRls('calling the rate limit helper directly cannot reset it', async () => {
  const owner = await makeUser();
  const me = await makeUser();
  const projectId = await makeProject(owner);

  await asUser(me);
  for (let i = 0; i < 120; i++) {
    await client.query('insert into public.likes (project_id, user_id) values ($1, $2)', [projectId, me]);
    await client.query('delete from public.likes where project_id = $1 and user_id = $2', [projectId, me]);
  }
  // The first version took the window from its caller, and a window of zero
  // deleted every event the caller had. All a caller passes now is the
  // action, and at the limit a direct call is refused like an insert.
  await expectRejects(
    () => client.query("select public.rate_limit_take('likes', 100000, interval '0 seconds')"),
    /does not exist/,
  );
  assert.equal((await client.query("select public.rate_limit_take('likes') as ok")).rows[0].ok, false);
  await expectRejects(
    () => client.query('insert into public.likes (project_id, user_id) values ($1, $2)', [projectId, me]),
    /Slow down/,
  );
});

itRls('nobody can read or write the rate limit log directly', async () => {
  const me = await makeUser();
  await asUser(me);
  await expectRejects(() => client.query('select * from public.rate_limit_events'), /permission denied/);
  await expectRejects(
    () => client.query("insert into public.rate_limit_events (user_id, action) values ($1, 'likes')", [me]),
    /permission denied/,
  );
});

// --- signed-out views ---------------------------------------------------

async function asAnonFrom(ip) {
  await client.query('set local role anon');
  await client.query("select set_config('request.jwt.claims', '', true)");
  await client.query("select set_config('request.headers', $1, true)", [JSON.stringify(ip ? { 'x-forwarded-for': `${ip}, 10.0.0.1` } : {})]);
}

itRls('a signed-out address counts once per entry per 6 hours, and is never stored', async () => {
  const owner = await makeUser();
  const projectId = await makeProject(owner);
  const view = async () => (await client.query('select public.log_project_view($1) as counted', [projectId])).rows[0].counted;

  await asAnonFrom('203.0.113.7');
  assert.equal(await view(), true);
  assert.equal(await view(), false);
  await asAnonFrom('203.0.113.8');
  assert.equal(await view(), true);

  await asSuperuser();
  assert.equal((await client.query('select views_count from public.projects where id = $1', [projectId])).rows[0].views_count, 2);
  const stored = await client.query("select 1 from public.anon_view_marks where encode(viewer_hash, 'escape') like '%203.0.113%'");
  assert.equal(stored.rowCount, 0);
  assert.equal((await client.query('select count(*)::int as n from public.anon_view_marks')).rows[0].n, 2);

  // Six hours later the same address counts again.
  await client.query("update public.anon_view_marks set created_at = now() - interval '7 hours'");
  await asAnonFrom('203.0.113.7');
  assert.equal(await view(), true);
});

itRls('at most 60 signed-out views per entry per hour count, however many addresses', async () => {
  const owner = await makeUser();
  const projectId = await makeProject(owner);

  for (let i = 0; i < 65; i++) {
    await asAnonFrom(`198.51.100.${i}`);
    await client.query('select public.log_project_view($1)', [projectId]);
  }
  await asSuperuser();
  assert.equal((await client.query('select views_count from public.projects where id = $1', [projectId])).rows[0].views_count, 60);
});

itRls('signed-out callers cannot read the view marks or the salts', async () => {
  await asAnon();
  await expectRejects(() => client.query('select * from public.anon_view_marks'), /permission denied/);
  await expectRejects(() => client.query('select * from public.view_salts'), /permission denied/);
});

// --- telling followers --------------------------------------------------

itRls('followers hear about a new entry once, and about a draft not at all', async () => {
  const author = await makeUser();
  const follower = await makeUser();
  const stranger = await makeUser();
  await client.query('insert into public.follows (follower_id, following_id) values ($1, $2)', [follower, author]);
  const posts = async (uid) =>
    (await client.query("select project_id from public.notifications where user_id = $1 and type = 'post'", [uid])).rows;

  await asUser(author);
  const draft = (await client.query("insert into public.projects (user_id, title, published) values ($1, 'Draft', false) returning id", [author])).rows[0].id;
  const live = (await client.query("insert into public.projects (user_id, title, published) values ($1, 'Live', true) returning id", [author])).rows[0].id;

  await asSuperuser();
  assert.deepEqual(await posts(follower), [{ project_id: live }]);
  assert.deepEqual(await posts(stranger), []);
  assert.deepEqual(await posts(author), []);

  // Publishing the draft tells them; taking an entry down and up again does not.
  await asUser(author);
  await client.query('update public.projects set published = true where id = $1', [draft]);
  await client.query('update public.projects set published = false where id = $1', [live]);
  await client.query('update public.projects set published = true where id = $1', [live]);
  await client.query("update public.projects set title = 'Live, edited', published = true where id = $1", [live]);

  await asSuperuser();
  const ids = (await posts(follower)).map((r) => r.project_id).sort();
  assert.deepEqual(ids, [draft, live].sort());
});

itRls('followers hear about changelog updates, one unread per project', async () => {
  const author = await makeUser();
  const follower = await makeUser();
  const projectId = await makeProject(author);
  const draftId = await makeProject(author, { published: false });
  await client.query('insert into public.follows (follower_id, following_id) values ($1, $2)', [follower, author]);
  const updates = async () =>
    (await client.query("select project_id, read_at is null as unread from public.notifications where user_id = $1 and type = 'update'", [follower])).rows;

  await asUser(author);
  await client.query("insert into public.project_updates (project_id, user_id, body) values ($1, $2, 'one'), ($1, $2, 'two')", [projectId, author]);
  await client.query("insert into public.project_updates (project_id, user_id, body) values ($1, $2, 'hidden')", [draftId, author]);
  await asSuperuser();
  assert.deepEqual(await updates(), [{ project_id: projectId, unread: true }]);

  await client.query("update public.notifications set read_at = now() where user_id = $1 and type = 'update'", [follower]);
  await asUser(author);
  await client.query("insert into public.project_updates (project_id, user_id, body) values ($1, $2, 'three')", [projectId, author]);
  await asSuperuser();
  assert.equal((await updates()).length, 2);
});

itRls('nobody can call the follower notification function directly', async () => {
  const me = await makeUser();
  await asUser(me);
  await expectRejects(() => client.query("select public.notify_followers($1, 'post', null)", [me]), /permission denied/);
});

// --- reputation ---------------------------------------------------------

itRls('every account has a reputation row, and an idle one is all zeros', async () => {
  const idle = await makeUser();
  const { rows } = await client.query('select * from public.user_reputation where user_id = $1', [idle]);
  assert.equal(rows.length, 1);
  const { user_id: _id, ...numbers } = rows[0];
  assert.ok(Object.values(numbers).every((n) => n === 0));
});

itRls('reputation counts what other people did with published work only', async () => {
  const author = await makeUser();
  const fan = await makeUser();
  const other = await makeUser();
  const live = await makeProject(author);
  const draft = await makeProject(author, { published: false });
  await client.query('insert into public.likes (project_id, user_id) values ($1, $2), ($1, $3), ($4, $2)', [live, fan, other, draft]);
  await client.query("insert into public.comments (project_id, user_id, body) values ($1, $2, 'x'), ($1, $3, 'mine')", [live, fan, author]);
  await client.query('insert into public.follows (follower_id, following_id) values ($1, $2)', [fan, author]);
  await client.query('insert into public.project_views (project_id, viewer_id) values ($1, $2), ($1, $2), ($1, $3), ($1, null)', [live, fan, other]);

  const { rows } = await client.query(
    'select published_projects, unique_viewers, likes_received, comments_received, followers, xp, lifetime_points from public.user_reputation where user_id = $1',
    [author],
  );
  assert.deepEqual(rows[0], {
    published_projects: 1,
    unique_viewers: 2,
    likes_received: 2,
    comments_received: 1,
    followers: 1,
    xp: 25 + 2 * 2 + 2 * 30 + 15 + 60,
    lifetime_points: 2 + 2 * 5 + 3 + 10,
  });

  const top = await client.query('select user_id from public.user_reputation where xp > 0 and user_id = any($1)', [[author, fan, other]]);
  assert.deepEqual(top.rows, [{ user_id: author }]);
});

// --- the catalogs the clients show vs. the tables that pay out -----------
//
// js/achievements.js and js/shop-items.js are display copies: the rewards,
// thresholds and prices that count live in achievement_defs and
// shop_item_defs. tests/parity.test.js holds the app's copies to the site's;
// this holds the site's to the database.

// Which metric each client-side stat stands for in achievement_metric().
const METRIC_OF_STAT = {
  projectsPublished: 'published_projects',
  totalLikes: 'total_likes',
  followerCount: 'follower_count',
  followingCount: 'following_count',
  totalComments: 'comment_count',
  accountAgeDays: 'account_age_days',
  uniqueViewers: 'unique_viewers',
  commentsReceived: 'comments_received',
  ownedItemsCount: 'owned_items_count',
  stylized: 'stylized',
  profileComplete: 'profile_complete',
  releases: 'releases',
  demoProjects: 'demo_projects',
};

itRls('every achievement the site shows pays what it says, for what it says', async () => {
  const shown = parseAchievements(readFileSync(path.join(__dirname, '../../js/achievements.js'), 'utf8')).map((a) => {
    const m = a.check.match(/^s\.(\w+)(?: >= (\d+))?$/);
    assert.ok(m, `unexpected check for ${a.id}: ${a.check}`);
    return { id: a.id, metric: METRIC_OF_STAT[m[1]], threshold: Number(m[2] ?? 1), reward: a.reward };
  });
  const { rows } = await client.query('select id, metric, threshold::int as threshold, reward from public.achievement_defs order by id');
  assert.deepEqual(rows, [...shown].sort((a, b) => a.id.localeCompare(b.id)));
});

itRls('every item the shop lists is charged at the price it shows', async () => {
  const listed = parseShopItems(readFileSync(path.join(__dirname, '../../js/shop-items.js'), 'utf8'));
  const { rows } = await client.query('select id, price from public.shop_item_defs where id = any($1)', [listed.map((i) => i.id)]);
  const charged = Object.fromEntries(rows.map((r) => [r.id, r.price]));
  assert.deepEqual(charged, Object.fromEntries(listed.map((i) => [i.id, i.price])));
});

// --- news ----------------------------------------------------------------
// Issues and articles: anyone reads, only news editors write, and only an
// admin decides who is one.

async function makeEditor(opts = {}) {
  const id = await makeUser(opts);
  await client.query('insert into public.news_editors (user_id) values ($1)', [id]);
  return id;
}

async function makeIssue(editor, { published = true, title = 'T&G Weekly 24-31.10' } = {}) {
  const { rows } = await client.query(
    'insert into public.news_issues (title, created_by, published) values ($1, $2, $3) returning id',
    [title, editor, published]
  );
  return rows[0].id;
}

itRls('anyone, signed in or not, reads published issues and their articles - drafts only editors', async () => {
  const editor = await makeEditor();
  const reader = await makeUser();
  const live = await makeIssue(editor);
  const draft = await makeIssue(editor, { published: false, title: 'Next week, unfinished' });
  await client.query("insert into public.news_articles (issue_id, author_id, title) values ($1, $3, 'Live story'), ($2, $3, 'Draft story')", [live, draft, editor]);

  for (const who of [() => asAnon(), () => asUser(reader)]) {
    await who();
    const issues = await client.query('select id from public.news_issues where id = any($1)', [[live, draft]]);
    assert.deepEqual(issues.rows.map((r) => r.id), [live]);
    const articles = await client.query('select title from public.news_articles where issue_id = any($1)', [[live, draft]]);
    assert.deepEqual(articles.rows.map((r) => r.title), ['Live story']);
    await asSuperuser();
  }

  await asUser(editor);
  const all = await client.query('select id from public.news_issues where id = any($1)', [[live, draft]]);
  assert.equal(all.rowCount, 2);
});

itRls('only news editors can create, edit or delete issues and articles', async () => {
  const editor = await makeEditor();
  const other = await makeUser();
  const issue = await makeIssue(editor);

  await asUser(other);
  await expectRejects(
    () => client.query("insert into public.news_issues (title, created_by) values ('My own news', $1)", [other]),
    /row-level security/
  );
  await expectRejects(
    () => client.query("insert into public.news_articles (issue_id, author_id, title) values ($1, $2, 'Sneaky story')", [issue, other]),
    /row-level security/
  );
  const edit = await client.query("update public.news_issues set title = 'Taken over' where id = $1", [issue]);
  assert.equal(edit.rowCount, 0);
  const del = await client.query('delete from public.news_issues where id = $1', [issue]);
  assert.equal(del.rowCount, 0);

  await asSuperuser();
  await asUser(editor);
  const { rows } = await client.query(
    "insert into public.news_articles (issue_id, author_id, title, lead) values ($1, $2, 'Real story', 'What happened.') returning id",
    [issue, editor]
  );
  const ok = await client.query("update public.news_articles set title = 'Real story, corrected' where id = $1", [rows[0].id]);
  assert.equal(ok.rowCount, 1);
});

itRls('nobody can make themselves a news editor; an admin can grant and take it back', async () => {
  const someone = await makeUser();
  const admin = await makeUser({ admin: true });

  await asUser(someone);
  await expectRejects(() => client.query('insert into public.news_editors (user_id) values ($1)', [someone]), /row-level security/);
  await expectRejects(() => client.query('select public.admin_set_news_editor($1, true)', [someone]), /Admin access required/);
  assert.equal((await client.query('select public.is_news_editor() as on')).rows[0].on, false);

  await asSuperuser();
  await asUser(admin);
  await client.query('select public.admin_set_news_editor($1, true)', [someone]);
  await asSuperuser();
  await asUser(someone);
  assert.equal((await client.query('select public.is_news_editor() as on')).rows[0].on, true);

  await asSuperuser();
  await asUser(admin);
  await client.query('select public.admin_set_news_editor($1, false)', [someone]);
  await asSuperuser();
  await asUser(someone);
  assert.equal((await client.query('select public.is_news_editor() as on')).rows[0].on, false);
});

itRls("an editor can't write under someone else's name or set an issue's counters", async () => {
  const editor = await makeEditor({ displayName: 'Real Name' });
  const victim = await makeUser({ displayName: 'Victim' });
  const issue = await makeIssue(editor);

  await asUser(editor);
  // Naming someone else as the author is not refused but corrected: the
  // article is the editor's, under the editor's own name.
  const forged = await client.query(
    "insert into public.news_articles (issue_id, author_id, author_name, title) values ($1, $2, 'Victim', 'Forged') returning author_id, author_name",
    [issue, victim]
  );
  assert.deepEqual(forged.rows[0], { author_id: editor, author_name: 'Real Name' });
  const { rows } = await client.query(
    "insert into public.news_articles (issue_id, author_id, author_name, title) values ($1, $2, 'Somebody Famous', 'Mine') returning author_name",
    [issue, editor]
  );
  assert.equal(rows[0].author_name, 'Real Name');

  await client.query('update public.news_issues set likes_count = 9999, comments_count = 9999, created_by = $2 where id = $1', [issue, victim]);
  const after = await client.query('select likes_count, comments_count, created_by from public.news_issues where id = $1', [issue]);
  assert.deepEqual(after.rows[0], { likes_count: 0, comments_count: 0, created_by: editor });
});

itRls('readers like and comment on an issue; counts follow, and none of it is worth XP', async () => {
  const editor = await makeEditor();
  const reader = await makeUser({ displayName: 'Reader' });
  const issue = await makeIssue(editor);

  await asUser(reader);
  await client.query('insert into public.news_likes (issue_id, user_id) values ($1, $2)', [issue, reader]);
  const { rows } = await client.query(
    "insert into public.news_comments (issue_id, user_id, author_name, body) values ($1, $2, 'Someone Else', 'Great week') returning author_name",
    [issue, reader]
  );
  assert.equal(rows[0].author_name, 'Reader');
  await expectRejects(
    () => client.query("insert into public.news_comments (issue_id, user_id, body) values ($1, $2, 'as the editor')", [issue, editor]),
    /row-level security/
  );

  await asSuperuser();
  const counts = await client.query('select likes_count, comments_count from public.news_issues where id = $1', [issue]);
  assert.deepEqual(counts.rows[0], { likes_count: 1, comments_count: 1 });
  const rep = await client.query('select xp from public.user_reputation where user_id = $1', [editor]);
  assert.equal(Number(rep.rows[0]?.xp ?? 0), 0);

  // The commenter or an editor can remove a comment; another reader can't.
  const stranger = await makeUser();
  await asUser(stranger);
  assert.equal((await client.query('delete from public.news_comments where issue_id = $1', [issue])).rowCount, 0);
  await asSuperuser();
  await asUser(editor);
  assert.equal((await client.query('delete from public.news_comments where issue_id = $1', [issue])).rowCount, 1);
});

itRls('an account still waiting on a parent can read the news but not react to it', async () => {
  const editor = await makeEditor();
  const issue = await makeIssue(editor);
  const teen = await makeUser({ birthDate: birthDateYearsAgo(14) });

  await asUser(teen);
  assert.equal((await client.query('select id from public.news_issues where id = $1', [issue])).rowCount, 1);
  await expectRejects(() => client.query('insert into public.news_likes (issue_id, user_id) values ($1, $2)', [issue, teen]), /row-level security/);
});
