// Compares the live database with schema.sql and lists every difference.
//
//   SUPABASE_DB_URL=postgres://...  node tools/schema-drift.mjs
//
// schema.sql is meant to be the whole truth about the database: re-run it and
// you have what is live. That stops being true the moment something is changed
// in the SQL Editor and not here, or added here and never run there - and both
// had happened (a table and three functions only in the database, a table and
// a function only in this file). This makes the gap visible.
//
// How: build a scratch database from tests/integration/sql/stub-supabase.sql +
// schema.sql on a local Postgres (TEST_DATABASE_URL, the same one the RLS
// tests use), run tools/schema-fingerprint.sql against it and against
// SUPABASE_DB_URL, and compare the two lists row by row. Exits 1 if they
// differ, 0 if they match, and 0 with a notice when SUPABASE_DB_URL is not set
// (pull requests from forks, a fresh clone) - there is nothing to compare.
//
// Only catalogs are read from the live side, so a role that can log in and
// nothing else is enough (see the README's "Schema drift" section).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIVE_URL = process.env.SUPABASE_DB_URL;
const LOCAL_URL = process.env.TEST_DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/postgres';
const SCRATCH = 'showcase_schema_drift';

const read = (file) => readFileSync(path.join(root, file), 'utf8');

function withDatabase(url, name) {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

async function fingerprint(connectionString) {
  const db = new pg.Client({ connectionString });
  await db.connect();
  try {
    const { rows } = await db.query(read('tools/schema-fingerprint.sql'));
    return new Map(rows.map((r) => [`${r.kind}\t${r.key}`, r.value]));
  } finally {
    await db.end();
  }
}

async function buildFromRepo() {
  const admin = new pg.Client({ connectionString: LOCAL_URL });
  await admin.connect();
  try {
    await admin.query(`drop database if exists ${SCRATCH}`);
    await admin.query(`create database ${SCRATCH}`);
  } finally {
    await admin.end();
  }
  const db = new pg.Client({ connectionString: withDatabase(LOCAL_URL, SCRATCH) });
  await db.connect();
  try {
    await db.query("set client_min_messages = 'warning'");
    await db.query(read('tests/integration/sql/stub-supabase.sql'));
    await db.query(read('schema.sql'));
  } finally {
    await db.end();
  }
  return withDatabase(LOCAL_URL, SCRATCH);
}

if (!LIVE_URL) {
  console.log('SUPABASE_DB_URL is not set - nothing to compare against. Skipping.');
  process.exit(0);
}

const [repo, live] = await Promise.all([buildFromRepo().then(fingerprint), fingerprint(LIVE_URL)]);

const lines = [];
for (const [id, value] of live) {
  if (!repo.has(id)) lines.push(`only in the database:  ${id.replace('\t', ' ')}\n    ${value}`);
  else if (repo.get(id) !== value) {
    lines.push(`differs:               ${id.replace('\t', ' ')}\n    database:   ${value}\n    schema.sql: ${repo.get(id)}`);
  }
}
for (const [id, value] of repo) {
  if (!live.has(id)) lines.push(`only in schema.sql:    ${id.replace('\t', ' ')}\n    ${value}`);
}

if (lines.length === 0) {
  console.log(`No drift: the database matches schema.sql (${repo.size} objects compared).`);
  process.exit(0);
}

console.log(`${lines.length} difference(s) between the database and schema.sql:\n`);
console.log(lines.sort().join('\n'));
console.log(
  '\nEither run schema.sql on the database (Supabase SQL Editor) or write the change into schema.sql - whichever is the one you meant.',
);
process.exit(1);
