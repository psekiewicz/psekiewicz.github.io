import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Project } from '../data/projects';

// Ranking for the Scrolls feed, ported from js/feed-rank.js. Scores by
// engagement, decays with age, personalises a little, and deliberately injects
// randomness so the feed differs between visits.
//
// The only change from the web version is storage: localStorage is synchronous
// and AsyncStorage isn't, so the seen-set is loaded once into memory when the
// feed mounts and written back through a cache.

const WEIGHTS = { like: 3, comment: 2 };

// How hard age pushes an entry down. This used to be 1.5, described as costing
// a day-old entry "roughly 5x" the engagement of a fresh one. It actually cost
// 47x, and a week-old entry 784x - on a site where entries arrive slowly, that
// is not a ranking, it is a delete. 0.4 keeps recency meaningful at a price the
// archive can survive: a day costs ~2.2x, a week ~5.9x.
const GRAVITY = 0.4;
const AGE_OFFSET_H = 4;

// Reactions per view, not reactions. Raw counts mostly measure how long
// something has been up, because exposure accrues with age; the rate is the
// part that says people liked it. Rates are shrunk towards the feed's own
// average by this many views' worth of evidence.
const PRIOR_VIEWS = 40;

// Something almost nobody has been shown cannot have earned a rate yet, and
// without a nudge never will: unseen means unranked means unseen.
const EXPLORE_VIEWS = 40;
const EXPLORE_BOOST = 1.5;

// How sharply sampling favours better entries. An exponent, not a multiplier:
// scaling every weight by the same factor leaves the distribution untouched,
// since u^(1/(w*k)) is u^(1/w) raised to 1/k and a monotonic transform of all
// the keys preserves their order.
const SHARPNESS = 1.5;

const FOLLOWED_BOOST = 1.5;

// Something you've already watched shouldn't vanish forever - it should just
// be much less likely to come up again for a while.
const SEEN_PENALTY = 0.2;
const SEEN_TTL_MS = 3 * 24 * 60 * 60 * 1000;

const SEEN_KEY = 'showcase:scrolls-seen';

let seenCache: Record<string, number> | null = null;

export async function loadSeenIds(): Promise<Map<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(SEEN_KEY);
    seenCache = raw ? JSON.parse(raw) : {};
    const cutoff = Date.now() - SEEN_TTL_MS;
    return new Map(Object.entries(seenCache!).filter(([, at]) => (at as number) > cutoff));
  } catch {
    seenCache = {};
    return new Map();
  }
}

export function markSeen(projectId: string) {
  try {
    if (!seenCache) seenCache = {};
    seenCache[projectId] = Date.now();
    // Fire-and-forget: the feed shouldn't wait on a disk write, and a failed
    // one just means the feed doesn't remember, which is a fine degradation.
    AsyncStorage.setItem(SEEN_KEY, JSON.stringify(seenCache)).catch(() => {});
  } catch {
    // Storage unavailable - same fine degradation.
  }
}

// Settings' "Reset Scrolls history" - lets already-seen entries surface
// again immediately instead of waiting out the TTL above.
export async function clearSeenIds() {
  seenCache = {};
  await AsyncStorage.removeItem(SEEN_KEY).catch(() => {});
}

type RankContext = {
  likeCounts: Map<string, number>;
  commentCounts: Map<string, number>;
  followingIds?: Set<string>;
  seenIds?: Map<string, number>;
};

// The prior every rate is shrunk towards: the feed's own average reactions per
// view. Taking it from the data means there is no magic constant to tune.
function meanReactionRate(projects: Project[], ctx: Required<RankContext>) {
  let points = 0;
  let views = 0;
  for (const project of projects) {
    points +=
      (ctx.likeCounts.get(project.id) || 0) * WEIGHTS.like +
      (ctx.commentCounts.get(project.id) || 0) * WEIGHTS.comment;
    views += project.viewsCount || 0;
  }
  return views > 0 ? points / views : 0.1;
}

function baseScore(project: Project, ctx: Required<RankContext>, meanRate: number) {
  const likes = ctx.likeCounts.get(project.id) || 0;
  const comments = ctx.commentCounts.get(project.id) || 0;
  const views = project.viewsCount || 0;

  const points = likes * WEIGHTS.like + comments * WEIGHTS.comment;
  const rate = (points + meanRate * PRIOR_VIEWS) / (views + PRIOR_VIEWS);
  const ageHours = Math.max(0, (Date.now() - new Date(project.createdAt).getTime()) / 3_600_000);

  let score = rate / (ageHours + AGE_OFFSET_H) ** GRAVITY;
  if (views < EXPLORE_VIEWS) score *= EXPLORE_BOOST;
  if (ctx.followingIds.has(project.uid)) score *= FOLLOWED_BOOST;
  if (ctx.seenIds.has(project.id)) score *= SEEN_PENALTY;
  return score;
}

// Weighted sampling without replacement (Efraimidis–Spirakis): a key of
// random()^(1/weight), sorted descending, makes higher-scored items likelier
// to come first without ever being guaranteed to.
function weightedShuffle(scored: { project: Project; score: number }[]) {
  // Normalised against the mean so SHARPNESS means the same thing whatever
  // magnitude the scores happen to come out at.
  const mean = scored.reduce((sum, e) => sum + e.score, 0) / (scored.length || 1) || 1e-9;
  return scored
    .map((entry) => ({
      ...entry,
      key: Math.random() ** (1 / Math.max((entry.score / mean) ** SHARPNESS, 1e-9)),
    }))
    .sort((a, b) => b.key - a.key)
    .map((entry) => entry.project);
}

// Spacing so one prolific author can't own a run of the feed. An author
// holding more than half of what's left is placed now, because otherwise a run
// of theirs at the end becomes unavoidable; when nobody is in that position,
// the highest-ranked project wins as usual.
function spaceOutBy(projects: Project[], keyOf: (p: Project) => string) {
  const rank = new Map(projects.map((project, index) => [project, index]));
  const byAuthor = new Map<string, Project[]>();
  projects.forEach((project) => {
    const key = keyOf(project);
    if (!byAuthor.has(key)) byAuthor.set(key, []);
    byAuthor.get(key)!.push(project);
  });

  const out: Project[] = [];
  let remaining = projects.length;
  let lastAuthor: string | null = null;

  while (remaining > 0) {
    let choice: string | null = null;

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
        if (rank.get(list[0])! < best) {
          best = rank.get(list[0])!;
          choice = uid;
        }
      }
    }

    // Only the author we just placed has anything left - a repeat here is
    // arithmetic, not a scheduling mistake.
    if (choice === null) choice = lastAuthor;

    out.push(byAuthor.get(choice!)!.shift()!);
    lastAuthor = choice;
    remaining -= 1;
  }

  return out;
}

export function rankFeed(projects: Project[], ctx: RankContext) {
  const full: Required<RankContext> = {
    likeCounts: ctx.likeCounts,
    commentCounts: ctx.commentCounts,
    followingIds: ctx.followingIds || new Set(),
    seenIds: ctx.seenIds || new Map(),
  };
  const meanRate = meanReactionRate(projects, full);
  const scored = projects.map((project) => ({ project, score: baseScore(project, full, meanRate) }));
  // Spread by author, then by kind: a run of one person is the obvious way a
  // feed goes monotonous, a run of one medium is the quieter way.
  return spaceOutBy(
    spaceOutBy(weightedShuffle(scored), (p) => p.uid),
    (p) => p.type || 'other'
  );
}
