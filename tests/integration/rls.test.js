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
