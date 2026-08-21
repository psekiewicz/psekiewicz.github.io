// Ranking for the Scrolls feed. Chronological order meant a good project
// was buried within a day and every visit showed the same thing in the same
// order; this scores by engagement, decays with age, personalises a little,
// and deliberately injects randomness so the feed differs between visits.
//
// Everything here runs on numbers the page already fetched (likes, comments,
// views, who you follow) - no extra tables, no server-side ranking job.

// Views are scored on a log scale, likes and comments linearly. A view
// from a signed-out visitor is the one signal here nobody has to
// authenticate to produce, so a script could otherwise buy its way up the
// feed with raw hits; log10 means the first ten views matter and the next
// thousand barely move the number, while a like still has to come from a
// real account that isn't the author's.
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
// average by this many views' worth of evidence, so three views and one like
// don't outrank everything.
const PRIOR_VIEWS = 40;

// Something almost nobody has been shown cannot have earned a rate yet, and
// without a nudge never will: unseen means unranked means unseen.
const EXPLORE_VIEWS = 40;
const EXPLORE_BOOST = 1.5;

// How sharply the sampling favours the better-scored entries. Applied as an
// exponent, not a multiplier: scaling every weight by the same factor leaves
// the sampling distribution untouched, because u^(1/(w*k)) is u^(1/w) raised
// to 1/k, and a monotonic transform of every key preserves their order.
const SHARPNESS = 1.5;

const FOLLOWED_BOOST = 1.5;

// Something you've already watched shouldn't vanish forever - it should
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
    // Storage unavailable (private mode) - the feed just won't remember,
    // which is a fine degradation.
  }
}

// The prior every rate is shrunk towards: the feed's own average reactions per
// view. Taking it from the data means there is no magic constant to tune, and
// it follows the site as it grows.
function meanReactionRate(projects, likeCounts, commentCounts) {
  let points = 0;
  let views = 0;
  for (const project of projects) {
    points +=
      (likeCounts.get(project.id) || 0) * WEIGHTS.like +
      (commentCounts.get(project.id) || 0) * WEIGHTS.comment;
    views += project.viewsCount || 0;
  }
  return views > 0 ? points / views : 0.1;
}

function baseScore(project, { likeCounts, commentCounts, followingIds, seenIds, meanRate }) {
  const likes = likeCounts.get(project.id) || 0;
  const comments = commentCounts.get(project.id) || 0;
  const views = project.viewsCount || 0;

  const points = likes * WEIGHTS.like + comments * WEIGHTS.comment;
  const rate = (points + meanRate * PRIOR_VIEWS) / (views + PRIOR_VIEWS);
  const ageHours = Math.max(0, (Date.now() - new Date(project.createdAt).getTime()) / 3_600_000);

  let score = rate / (ageHours + AGE_OFFSET_H) ** GRAVITY;
  if (views < EXPLORE_VIEWS) score *= EXPLORE_BOOST;
  if (followingIds.has(project.uid)) score *= FOLLOWED_BOOST;
  if (seenIds.has(project.id)) score *= SEEN_PENALTY;
  return score;
}

// Weighted sampling without replacement (Efraimidis–Spirakis): giving each
// item a key of random()^(1/weight) and sorting by it descending produces an
// order where higher-scored items are likelier to come first, without ever
// being guaranteed to. That's what keeps the feed fresh between visits while
// still favouring good projects - a plain sort would be identical every time.
function weightedShuffle(scored) {
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

// Spacing so one prolific author can't own a run of the feed.
//
// The obvious greedy - "take the next project by anyone other than whoever
// I just placed" - looks right and isn't: it spends the other authors early
// and leaves everything by the prolific one bunched at the end. With five
// of seven projects by one author it happily produced all five in a row.
//
// So an author holding more than half of what's left is placed now, because
// otherwise a run of theirs at the end becomes unavoidable; when nobody is
// in that position, the highest-ranked project wins as usual. Ranked order
// is preserved within each author, so this only ever reorders across them.
function spaceOutBy(projects, keyOf) {
  const rank = new Map(projects.map((project, index) => [project, index]));
  const byAuthor = new Map();
  projects.forEach((project) => {
    const key = keyOf(project);
    if (!byAuthor.has(key)) byAuthor.set(key, []);
    byAuthor.get(key).push(project);
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

    // Only the author we just placed has anything left - a repeat here is
    // arithmetic, not a scheduling mistake.
    if (choice === null) choice = lastAuthor;

    out.push(byAuthor.get(choice).shift());
    lastAuthor = choice;
    remaining -= 1;
  }

  return out;
}

export function rankFeed(projects, { likeCounts, commentCounts, followingIds = new Set(), seenIds = new Map() }) {
  const meanRate = meanReactionRate(projects, likeCounts, commentCounts);
  const scored = projects.map((project) => ({
    project,
    score: baseScore(project, { likeCounts, commentCounts, followingIds, seenIds, meanRate }),
  }));
  // Spread by author, then by kind: a run of one person is the obvious way a
  // feed goes monotonous, a run of one medium is the quieter way.
  return spaceOutBy(spaceOutBy(weightedShuffle(scored), (p) => p.uid), (p) => p.type || 'other');
}
