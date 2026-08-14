// Ranking for the Scrolls feed. Chronological order meant a good project
// was buried within a day and every visit showed the same thing in the same
// order; this scores by engagement, decays with age, personalises a little,
// and deliberately injects randomness so the feed differs between visits.
//
// Everything here runs on numbers the page already fetched (likes, comments,
// views, who you follow) — no extra tables, no server-side ranking job.

const WEIGHTS = { like: 3, comment: 2, view: 0.1 };

// How hard age pushes a project down. 1.5 is the usual Hacker News-ish
// gravity: a day-old project needs roughly 5x the engagement of a fresh one
// to rank alongside it.
const GRAVITY = 1.5;

const FOLLOWED_BOOST = 1.5;

// Something you've already watched shouldn't vanish forever — it should
// just be much less likely to come up again for a while.
const SEEN_PENALTY = 0.2;
const SEEN_TTL_MS = 3 * 24 * 60 * 60 * 1000;

const SEEN_KEY = 'showcase:scrolls-seen';

export function getSeenIds() {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}');
    const cutoff = Date.now() - SEEN_TTL_MS;
    return new Map(Object.entries(raw).filter(([, at]) => at > cutoff));
  } catch {
    return new Map();
  }
}

export function markSeen(projectId) {
  try {
    const seen = Object.fromEntries(getSeenIds());
    seen[projectId] = Date.now();
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    // Storage unavailable (private mode) — the feed just won't remember,
    // which is a fine degradation.
  }
}

function baseScore(project, { likeCounts, commentCounts, followingIds, seenIds }) {
  const likes = likeCounts.get(project.id) || 0;
  const comments = commentCounts.get(project.id) || 0;
  const views = project.viewsCount || 0;

  // +1 so a brand-new project with no engagement still has a non-zero
  // score and can be sampled at all.
  const engagement = 1 + likes * WEIGHTS.like + comments * WEIGHTS.comment + views * WEIGHTS.view;
  const ageHours = Math.max(0, (Date.now() - new Date(project.createdAt).getTime()) / 3_600_000);

  let score = engagement / (ageHours + 2) ** GRAVITY;
  if (followingIds.has(project.uid)) score *= FOLLOWED_BOOST;
  if (seenIds.has(project.id)) score *= SEEN_PENALTY;
  return score;
}

// Weighted sampling without replacement (Efraimidis–Spirakis): giving each
// item a key of random()^(1/weight) and sorting by it descending produces an
// order where higher-scored items are likelier to come first, without ever
// being guaranteed to. That's what keeps the feed fresh between visits while
// still favouring good projects — a plain sort would be identical every time.
function weightedShuffle(scored) {
  return scored
    .map((entry) => ({ ...entry, key: Math.random() ** (1 / Math.max(entry.score, 1e-9)) }))
    .sort((a, b) => b.key - a.key)
    .map((entry) => entry.project);
}

// Spacing so one prolific author can't own a run of the feed.
//
// The obvious greedy — "take the next project by anyone other than whoever
// I just placed" — looks right and isn't: it spends the other authors early
// and leaves everything by the prolific one bunched at the end. With five
// of seven projects by one author it happily produced all five in a row.
//
// So an author holding more than half of what's left is placed now, because
// otherwise a run of theirs at the end becomes unavoidable; when nobody is
// in that position, the highest-ranked project wins as usual. Ranked order
// is preserved within each author, so this only ever reorders across them.
function spaceOutAuthors(projects) {
  const rank = new Map(projects.map((project, index) => [project, index]));
  const byAuthor = new Map();
  projects.forEach((project) => {
    if (!byAuthor.has(project.uid)) byAuthor.set(project.uid, []);
    byAuthor.get(project.uid).push(project);
  });

  const out = [];
  let remaining = projects.length;
  let lastAuthor = null;

  while (remaining > 0) {
    let choice = null;

    for (const [uid, list] of byAuthor) {
      if (list.length && uid !== lastAuthor && list.length * 2 > remaining) {
        choice = uid;
        break;
      }
    }

    if (choice === null) {
      let best = Infinity;
      for (const [uid, list] of byAuthor) {
        if (!list.length || uid === lastAuthor) continue;
        if (rank.get(list[0]) < best) {
          best = rank.get(list[0]);
          choice = uid;
        }
      }
    }

    // Only the author we just placed has anything left — a repeat here is
    // arithmetic, not a scheduling mistake.
    if (choice === null) choice = lastAuthor;

    out.push(byAuthor.get(choice).shift());
    lastAuthor = choice;
    remaining -= 1;
  }

  return out;
}

export function rankFeed(projects, { likeCounts, commentCounts, followingIds = new Set(), seenIds = new Map() }) {
  const scored = projects.map((project) => ({
    project,
    score: baseScore(project, { likeCounts, commentCounts, followingIds, seenIds }),
  }));
  return spaceOutAuthors(weightedShuffle(scored));
}
