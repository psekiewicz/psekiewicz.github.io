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
async function makeUser({ email = `${uuid()}@example.com`, displayName = null, admin = false } = {}) {
  const id = uuid();
  await client.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [
    id,
    email,
    displayName ? { display_name: displayName } : {},
  ]);
  if (admin) {
    await client.query('update public.profiles set is_admin = true where id = $1', [id]);
  }
  return id;
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
