import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installLocalStorage } from './helpers/browser-env.js';

installLocalStorage();

const { getSeenIds, markSeen, rankFeed } = await import('../js/feed-rank.js');

test('markSeen/getSeenIds round-trip through localStorage', () => {
  localStorage.clear();
  assert.equal(getSeenIds().size, 0);
  markSeen('p1');
  markSeen('p2');
  const seen = getSeenIds();
  assert.equal(seen.size, 2);
  assert.ok(seen.has('p1'));
  assert.ok(seen.has('p2'));
});

test('getSeenIds drops entries older than the 3-day TTL', () => {
  localStorage.clear();
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
  localStorage.setItem(
    'showcase:scrolls-seen',
    JSON.stringify({
      stale: Date.now() - threeDaysMs - 1000,
      fresh: Date.now() - 1000,
    }),
  );
  const seen = getSeenIds();
  assert.equal(seen.has('stale'), false);
  assert.equal(seen.has('fresh'), true);
});

test('getSeenIds recovers from corrupt storage instead of throwing', () => {
  localStorage.setItem('showcase:scrolls-seen', '{not json');
  assert.equal(getSeenIds().size, 0);
});

function makeProject(id, uid, { createdAt = new Date().toISOString(), views = 100, type = 'video' } = {}) {
  return { id, uid, createdAt, viewsCount: views, type };
}

test('rankFeed returns exactly the same set of projects it was given', () => {
  const projects = [makeProject('a', 'u1'), makeProject('b', 'u2'), makeProject('c', 'u3')];
  const ranked = rankFeed(projects, { likeCounts: new Map(), commentCounts: new Map() });
  assert.equal(ranked.length, projects.length);
  assert.deepEqual(
    new Set(ranked.map((p) => p.id)),
    new Set(projects.map((p) => p.id)),
  );
});

test('rankFeed spaces out a prolific author instead of bunching all their entries', () => {
  // One author holds 5 of 7 projects - the naive "anyone but the last
  // author" approach bunches all five in a row (see the comment in
  // feed-rank.js: "it happily produced all five in a row"). spaceOutBy
  // doesn't promise perfect spacing, but it must never regress to that.
  const projects = [
    makeProject('a1', 'prolific'),
    makeProject('a2', 'prolific'),
    makeProject('a3', 'prolific'),
    makeProject('a4', 'prolific'),
    makeProject('a5', 'prolific'),
    makeProject('b1', 'other1'),
    makeProject('b2', 'other2'),
  ];
  for (let i = 0; i < 50; i += 1) {
    const ranked = rankFeed(projects, { likeCounts: new Map(), commentCounts: new Map() });

    let maxConsecutive = 0;
    let run = 0;
    let last = null;
    for (const project of ranked) {
      run = project.uid === last ? run + 1 : 1;
      last = project.uid;
      maxConsecutive = Math.max(maxConsecutive, run);
    }
    assert.ok(maxConsecutive < 5, `expected the prolific author's 5 entries not all consecutive, got a run of ${maxConsecutive}`);
  }
});

test('rankFeed never places the same author twice in a row when no author holds a majority', () => {
  const projects = [
    makeProject('a', 'u1'),
    makeProject('b', 'u2'),
    makeProject('c', 'u3'),
    makeProject('d', 'u4'),
  ];
  for (let i = 0; i < 20; i += 1) {
    const ranked = rankFeed(projects, { likeCounts: new Map(), commentCounts: new Map() });
    for (let j = 1; j < ranked.length; j += 1) {
      assert.notEqual(ranked[j].uid, ranked[j - 1].uid);
    }
  }
});
