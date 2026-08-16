import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Project } from '../data/projects';

// Ranking for the Scrolls feed, ported from js/feed-rank.js. Scores by
// engagement, decays with age, personalises a little, and deliberately injects
// randomness so the feed differs between visits.
//
// The only change from the web version is storage: localStorage is synchronous
// and AsyncStorage isn't, so the seen-set is loaded once into memory when the
// feed mounts and written back through a cache.

const WEIGHTS = { like: 3, comment: 2, view: 2 };

// How hard age pushes a project down. 1.5 is the usual Hacker News-ish
// gravity: a day-old project needs roughly 5x the engagement of a fresh one.
const GRAVITY = 1.5;
const FOLLOWED_BOOST = 1.5;

// Something you've already watched shouldn't vanish forever — it should just
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
    // Storage unavailable — same fine degradation.
  }
}

type RankContext = {
  likeCounts: Map<string, number>;
  commentCounts: Map<string, number>;
  followingIds?: Set<string>;
  seenIds?: Map<string, number>;
};

function baseScore(project: Project, ctx: Required<RankContext>) {
  const likes = ctx.likeCounts.get(project.id) || 0;
  const comments = ctx.commentCounts.get(project.id) || 0;
  const views = project.viewsCount || 0;

  // +1 so a brand-new project with no engagement still has a non-zero score
  // and can be sampled at all.
  const engagement =
    1 + likes * WEIGHTS.like + comments * WEIGHTS.comment + Math.log10(1 + views) * WEIGHTS.view;
  const ageHours = Math.max(0, (Date.now() - new Date(project.createdAt).getTime()) / 3_600_000);

  let score = engagement / (ageHours + 2) ** GRAVITY;
  if (ctx.followingIds.has(project.uid)) score *= FOLLOWED_BOOST;
  if (ctx.seenIds.has(project.id)) score *= SEEN_PENALTY;
  return score;
}

// Weighted sampling without replacement (Efraimidis–Spirakis): a key of
// random()^(1/weight), sorted descending, makes higher-scored items likelier
// to come first without ever being guaranteed to.
function weightedShuffle(scored: { project: Project; score: number }[]) {
  return scored
    .map((entry) => ({ ...entry, key: Math.random() ** (1 / Math.max(entry.score, 1e-9)) }))
    .sort((a, b) => b.key - a.key)
    .map((entry) => entry.project);
}

// Spacing so one prolific author can't own a run of the feed. An author
// holding more than half of what's left is placed now, because otherwise a run
// of theirs at the end becomes unavoidable; when nobody is in that position,
// the highest-ranked project wins as usual.
function spaceOutAuthors(projects: Project[]) {
  const rank = new Map(projects.map((project, index) => [project, index]));
  const byAuthor = new Map<string, Project[]>();
  projects.forEach((project) => {
    if (!byAuthor.has(project.uid)) byAuthor.set(project.uid, []);
    byAuthor.get(project.uid)!.push(project);
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

    // Only the author we just placed has anything left — a repeat here is
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
  const scored = projects.map((project) => ({ project, score: baseScore(project, full) }));
  return spaceOutAuthors(weightedShuffle(scored));
}
