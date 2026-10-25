// A stand-in for @supabase/supabase-js, served to the browser in place of the
// esm.sh module during the smoke tests (tests/smoke/pages.test.js). It keeps a
// small in-memory database so every page draws real content - posts, people,
// comments, notifications - rather than empty states, without a network and
// without touching the real project.
//
// It is deliberately a sketch of the client, not a copy: enough of the query
// builder for the calls the site makes, filters applied to the seeded rows.
// The point is to run every page's code paths, not to model Postgres.
//
// Signed in or out is decided by the test: an init script sets
// window.__SMOKE_USER__ (an auth user object) before any page script runs.

const now = Date.now();
const ago = (hours) => new Date(now - hours * 3_600_000).toISOString();

const ADA = '00000000-0000-4000-8000-00000000000a';
const GRACE = '00000000-0000-4000-8000-00000000000b';
const P1 = '00000000-0000-4000-8000-0000000000a1';
const P2 = '00000000-0000-4000-8000-0000000000a2';
const P3 = '00000000-0000-4000-8000-0000000000a3';
const CBOT = '176c749c-dd5b-4aee-b184-aa59381e9d1d';
const I1 = '00000000-0000-4000-8000-0000000000c1';
const I2 = '00000000-0000-4000-8000-0000000000c2';
const I3 = '00000000-0000-4000-8000-0000000000c3';
const A1 = '00000000-0000-4000-8000-0000000000d1';
const A2 = '00000000-0000-4000-8000-0000000000d2';

export const SMOKE_IDS = { ADA, GRACE, CBOT, P1, P2, P3, I1, I2, I3, A1, A2 };

const profile = (id, name, extra = {}) => ({
  id,
  display_name: name,
  bio: `${name} makes things.`,
  avatar_url: '',
  created_at: ago(24 * 90),
  points: 120,
  points_earned_total: 120,
  equipped_bg: 'none',
  equipped_border: 'none',
  equipped_name_effect: 'none',
  is_admin: false,
  ...extra,
});

const project = (id, uid, title, extra = {}) => ({
  id,
  user_id: uid,
  author_name: { [ADA]: 'Ada', [GRACE]: 'Grace', [CBOT]: 'CBot' }[uid],
  title,
  summary: `${title}, in one line.`,
  description: `## About\n\nA **real** description with a [link](https://example.com) and a list:\n\n- one\n- two`,
  image_url: '',
  tags: ['tools', 'web'],
  repo_url: '',
  live_url: '',
  project_type: 'app',
  views_count: 12,
  likes_count: 1,
  comments_count: 1,
  media_url: '',
  scroll_image_url: '',
  scroll_bg: '',
  published: true,
  created_at: ago(30),
  updated_at: ago(30),
  ...extra,
});

const db = {
  profiles: [profile(ADA, 'Ada', { is_admin: true, equipped_border: 'border-gold', equipped_name_effect: 'name-gradient' }), profile(GRACE, 'Grace'), profile(CBOT, 'CBot')],
  projects: [
    project(P1, GRACE, 'Pocket Synth', {
      live_url: 'https://example.com/synth',
      repo_url: 'https://example.com/synth.git',
      project_type: 'music',
    }),
    project(P2, ADA, 'Trail Map', { created_at: ago(200), updated_at: ago(5) }),
    project(P3, ADA, 'Unfinished idea', { published: false }),
  ],
  // News: CBot writes T&G Weekly; Ada is an editor too, so the signed-in
  // pages show the newsroom's controls. One live newsletter with two
  // articles (Grace has read the older one), one draft newsletter, and a
  // draft of Grace's own.
  news_editors: [{ user_id: CBOT }, { user_id: ADA }],
  newsletters: [
    {
      id: I1, title: 'XOXD T&G Weekly', summary: 'Tech and gaming news of the week, every Saturday.',
      cover_url: '', created_by: CBOT, published: true, created_at: ago(200), updated_at: ago(200),
    },
    { id: I2, title: 'Coming soon', summary: '', cover_url: '', created_by: ADA, published: false, created_at: ago(2), updated_at: ago(2) },
    { id: I3, title: "Grace's Picks", summary: '', cover_url: '', created_by: GRACE, published: false, created_at: ago(1), updated_at: ago(1) },
  ],
  news_articles: [
    {
      id: A1, newsletter_id: I1, author_id: CBOT, author_name: 'CBot', title: 'XOXD T&G Weekly - 17-24 Oct 2026',
      lead: 'A launch trailer, a probe and a remaster.', body: `## Top stories\n\n- **A big launch trailer lands.** More than expected.\n\n## New on XOXD\n\n- **Pocket Synth** by Grace - a synth. [Try it on XOXD](https://psekiewicz.github.io/project?id=${P1})`, image_url: '',
      source_name: '', source_url: '', likes_count: 1, comments_count: 1, created_at: ago(5), updated_at: ago(5),
    },
    {
      id: A2, newsletter_id: I1, author_id: CBOT, author_name: 'CBot', title: 'XOXD T&G Weekly - 10-17 Oct 2026',
      lead: 'Regulators open a probe.', body: 'Details are thin.', image_url: '', source_name: 'Example News',
      source_url: 'https://example.com/probe', likes_count: 0, comments_count: 0, created_at: ago(170), updated_at: ago(170),
    },
  ],
  news_likes: [{ article_id: A1, user_id: GRACE, created_at: ago(4) }],
  news_comments: [{ id: 'nc1', article_id: A1, user_id: GRACE, author_name: 'Grace', body: 'Good week.', created_at: ago(4) }],
  news_reads: [{ user_id: GRACE, article_id: A2, read_at: ago(100) }],
  newsletter_editors: [],
  likes: [{ project_id: P1, user_id: ADA, created_at: ago(3) }],
  comments: [
    { id: 'c1', project_id: P1, user_id: ADA, author_name: 'Ada', body: 'Lovely sound.', created_at: ago(2) },
    { id: 'c2', project_id: P2, user_id: GRACE, author_name: 'Grace', body: 'Where is this?', created_at: ago(1) },
  ],
  follows: [{ follower_id: ADA, following_id: GRACE, created_at: ago(48) }],
  project_updates: [
    { id: 'u1', project_id: P1, user_id: GRACE, version: 'v0.2', body: 'Added a filter knob.', created_at: ago(6) },
    { id: 'u2', project_id: P1, user_id: GRACE, version: 'v0.1', body: 'First sound.', created_at: ago(40) },
  ],
  saves: [{ user_id: ADA, project_id: P1, created_at: ago(4) }],
  notifications: [
    { id: 1, user_id: ADA, actor_id: GRACE, type: 'post', project_id: P1, created_at: ago(30), read_at: null },
    { id: 2, user_id: ADA, actor_id: GRACE, type: 'update', project_id: P1, created_at: ago(6), read_at: null },
    { id: 3, user_id: ADA, actor_id: GRACE, type: 'comment', project_id: P2, created_at: ago(1), read_at: null },
    { id: 4, user_id: GRACE, actor_id: ADA, type: 'follow', project_id: null, created_at: ago(48), read_at: ago(40) },
  ],
  account_ages: [
    { user_id: ADA, birth_date: '1990-01-01', consent_state: 'not_required', created_at: ago(24 * 90) },
    { user_id: GRACE, birth_date: '1992-05-05', consent_state: 'not_required', created_at: ago(24 * 90) },
  ],
  unlocked_achievements: [{ user_id: ADA, achievement_id: 'launched', claimed_at: ago(100) }],
  owned_items: [{ user_id: ADA, item_id: 'bg-paper', purchased_at: ago(100) }],
  achievement_defs: [
    { id: 'launched', metric: 'published_projects', threshold: 1, reward: 20 },
    { id: 'well-liked', metric: 'total_likes', threshold: 10, reward: 30 },
  ],
  shop_item_defs: [
    { id: 'bg-paper', price: 40 },
    { id: 'border-ink', price: 20 },
  ],
  shop_bundle_defs: [{ id: 'set-paper', price: 60 }],
  shop_bundle_items: [{ bundle_id: 'set-paper', item_id: 'bg-paper' }],
  announcements: [],
  reports: [],
  user_reputation: [
    {
      user_id: GRACE, published_projects: 1, total_views: 12, unique_viewers: 3, likes_received: 1,
      comments_received: 1, followers: 1, xp: 25 + 6 + 30 + 15 + 60, lifetime_points: 3 + 5 + 3 + 10,
      releases: 2, demo_projects: 1,
    },
    {
      user_id: ADA, published_projects: 1, total_views: 12, unique_viewers: 1, likes_received: 0,
      comments_received: 1, followers: 0, xp: 25 + 2 + 15, lifetime_points: 1 + 3, releases: 0, demo_projects: 0,
    },
  ],
};

// project_latest_updates is a view: one row per project, its newest update.
function latestUpdates() {
  const seen = new Map();
  [...db.project_updates]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .forEach((u) => seen.has(u.project_id) || seen.set(u.project_id, u));
  return [...seen.values()];
}

function rowsOf(table) {
  if (table === 'project_latest_updates') return latestUpdates();
  if (!db[table]) db[table] = [];
  return db[table];
}

function currentUser() {
  return globalThis.__SMOKE_USER__ || null;
}

// What RLS would hide: drafts from anyone but their owner, and other
// people's private rows. Only the rules the pages would visibly trip over.
const isNewsroom = () => db.news_editors.some((e) => e.user_id === currentUser()?.id);

function canWriteNewsletter(id) {
  const me = currentUser()?.id;
  if (!me) return false;
  return (
    isNewsroom() ||
    db.newsletters.some((n) => n.id === id && n.created_by === me) ||
    db.newsletter_editors.some((e) => e.newsletter_id === id && e.user_id === me)
  );
}

// my_newsletter_terms() in schema.sql: free once 25 people follow you,
// otherwise 500 points; up to 3 each; the newsroom is exempt.
function newsletterTerms() {
  const me = currentUser()?.id;
  const followers = db.follows.filter((f) => f.following_id === me).length;
  const owned = db.newsletters.filter((n) => n.created_by === me).length;
  const points = db.profiles.find((p) => p.id === me)?.points ?? 0;
  const cost = isNewsroom() || followers >= 25 ? 0 : 500;
  return {
    price: 500, popular_followers: 25, max_owned: 3, followers, owned, points, cost,
    can_start: (isNewsroom() || owned < 3) && points >= cost,
  };
}

function visible(table, row) {
  const me = currentUser()?.id;
  if (table === 'projects') return row.published || row.user_id === me;
  if (['notifications', 'saves', 'account_ages', 'news_reads'].includes(table)) return row.user_id === me;
  if (table === 'newsletters') return row.published || canWriteNewsletter(row.id);
  return true;
}

function likePattern(pattern, flags) {
  const escaped = String(pattern).replace(/[.*+?^${}()|[\]\\]/g, (c) => (c === '\\' ? '\\\\' : `\\${c}`));
  // 's': in Postgres, % and _ match newlines too.
  return new RegExp(`^${escaped.replace(/%/g, '.*').replace(/_/g, '.')}$`, `${flags}s`);
}

class Query {
  constructor(table) {
    this.table = table;
    this.op = 'select';
    this.columns = '*';
    this.filters = [];
    this.orders = [];
    this.limitTo = null;
    this.rangeTo = null;
    // Not `single`: an own property of that name would hide single() below.
    this.singleMode = null;
    this.head = false;
    this.count = null;
    this.payload = null;
  }

  select(columns = '*', options = {}) {
    if (this.op === 'select') this.columns = columns;
    if (options.head) this.head = true;
    if (options.count) this.count = options.count;
    return this;
  }
  insert(rows) { this.op = 'insert'; this.payload = rows; return this; }
  upsert(rows) { this.op = 'upsert'; this.payload = rows; return this; }
  update(patch) { this.op = 'update'; this.payload = patch; return this; }
  delete() { this.op = 'delete'; return this; }

  eq(c, v) { this.filters.push((r) => r[c] === v); return this; }
  neq(c, v) { this.filters.push((r) => r[c] !== v); return this; }
  gt(c, v) { this.filters.push((r) => r[c] > v); return this; }
  gte(c, v) { this.filters.push((r) => r[c] >= v); return this; }
  lt(c, v) { this.filters.push((r) => r[c] < v); return this; }
  lte(c, v) { this.filters.push((r) => r[c] <= v); return this; }
  in(c, values) { const set = new Set(values); this.filters.push((r) => set.has(r[c])); return this; }
  is(c, v) { this.filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return this; }
  ilike(c, pattern) { const re = likePattern(pattern, 'i'); this.filters.push((r) => re.test(String(r[c] ?? ''))); return this; }
  like(c, pattern) { const re = likePattern(pattern, ''); this.filters.push((r) => re.test(String(r[c] ?? ''))); return this; }
  contains(c, values) { this.filters.push((r) => [].concat(values).every((v) => (r[c] || []).includes(v))); return this; }
  match(obj) { Object.entries(obj).forEach(([c, v]) => this.eq(c, v)); return this; }
  // Rarely used and not worth parsing: let everything through.
  or() { return this; }
  not() { return this; }
  filter() { return this; }

  order(c, { ascending = true } = {}) { this.orders.push([c, ascending]); return this; }
  limit(n) { this.limitTo = n; return this; }
  range(from, to) { this.rangeTo = [from, to]; return this; }
  maybeSingle() { this.singleMode = 'maybe'; return this; }
  single() { this.singleMode = 'one'; return this; }

  then(resolve, reject) {
    try {
      resolve(this.run());
    } catch (err) {
      if (reject) reject(err);
      else throw err;
    }
  }

  matching() {
    return rowsOf(this.table).filter((r) => visible(this.table, r) && this.filters.every((f) => f(r)));
  }

  run() {
    const table = rowsOf(this.table);
    if (this.op === 'insert' || this.op === 'upsert') {
      const rows = [].concat(this.payload).map((r) => ({ id: `fake-${Math.random().toString(36).slice(2)}`, created_at: new Date().toISOString(), ...r }));
      table.push(...rows);
      return this.shape(rows);
    }
    if (this.op === 'update') {
      const rows = this.matching();
      rows.forEach((r) => Object.assign(r, this.payload));
      return this.shape(rows);
    }
    if (this.op === 'delete') {
      const rows = this.matching();
      rows.forEach((r) => table.splice(table.indexOf(r), 1));
      return this.shape(rows);
    }
    let rows = this.matching();
    for (const [c, asc] of [...this.orders].reverse()) {
      rows = [...rows].sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1));
    }
    const total = rows.length;
    if (this.rangeTo) rows = rows.slice(this.rangeTo[0], this.rangeTo[1] + 1);
    if (this.limitTo != null) rows = rows.slice(0, this.limitTo);
    if (this.head) return { data: null, count: total, error: null };
    return { ...this.shape(rows.map((r) => this.embed(r))), count: this.count ? total : null };
  }

  // `select('..., projects (...)')`: the one embed the site uses.
  embed(row) {
    if (!/\bprojects\s*\(/.test(this.columns) || !row.project_id) return { ...row };
    const p = db.projects.find((x) => x.id === row.project_id && visible('projects', x));
    return { ...row, projects: p ? { ...p } : null };
  }

  shape(rows) {
    if (this.singleMode === 'maybe') return { data: rows[0] ?? null, error: null };
    if (this.singleMode === 'one') {
      return rows.length ? { data: rows[0], error: null } : { data: null, error: { message: 'No rows', code: 'PGRST116' } };
    }
    return { data: rows, error: null };
  }
}

const RPC = {
  log_project_view: () => true,
  collect_earnings: () => ({ paid: 0, points: 120 }),
  record_achievement_unlock: () => null,
  claim_achievement: () => 140,
  my_view_timestamps: () => [ago(1), ago(20), ago(50)],
  set_birth_date: () => 'not_required',
  admin_list_users: () =>
    db.profiles.map((p) => ({
      id: p.id, email: `${p.display_name.toLowerCase()}@example.com`, display_name: p.display_name,
      avatar_url: p.avatar_url, is_admin: p.is_admin, banned_until: null, created_at: p.created_at,
    })),
  admin_list_reports: () => [],
  admin_close_reports: () => 0,
  purchase_item: () => 80,
  purchase_bundle: () => 60,
  is_news_editor: () => isNewsroom(),
  can_write_newsletter: ({ p_newsletter }) => canWriteNewsletter(p_newsletter),
  my_newsletter_terms: () => newsletterTerms(),
  start_newsletter: ({ p_title, p_summary, p_cover_url }) => {
    const id = `fake-${Math.random().toString(36).slice(2)}`;
    const at = new Date().toISOString();
    db.newsletters.push({ id, title: p_title, summary: p_summary, cover_url: p_cover_url, created_by: currentUser().id, published: true, created_at: at, updated_at: at });
    return id;
  },
  admin_set_news_editor: () => null,
};

const listeners = new Set();

export function createClient() {
  const session = () => {
    const user = currentUser();
    return user ? { user, access_token: 'fake-token', expires_at: Math.floor(now / 1000) + 3600 } : null;
  };
  const ok = (data) => Promise.resolve({ data, error: null });

  return {
    from: (table) => new Query(table),
    rpc: (name, args = {}) => ok(RPC[name] ? RPC[name](args) : null),
    auth: {
      getUser: () => ok({ user: currentUser() }),
      getSession: () => ok({ session: session() }),
      onAuthStateChange(callback) {
        listeners.add(callback);
        setTimeout(() => callback('INITIAL_SESSION', session()), 0);
        return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
      },
      signInWithPassword: () => ok({ user: currentUser(), session: session() }),
      signUp: () => ok({ user: null, session: null }),
      signOut: () => ok({}),
      resetPasswordForEmail: () => ok({}),
      updateUser: () => ok({ user: currentUser() }),
    },
    storage: {
      from: (bucket) => ({
        upload: (path) => ok({ path }),
        remove: () => ok([]),
        list: () => ok([]),
        getPublicUrl: (path) => ({ data: { publicUrl: `https://storage.invalid/${bucket}/${path}` } }),
      }),
    },
    functions: { invoke: () => ok({ ok: true, status: 'confirmed' }) },
  };
}
