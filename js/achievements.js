import { getCommentCountByUser } from './comments-data.js';
import { getFollowingCount } from './follows-data.js';
import { getProfile } from './profiles-data.js';
import { getOwnedItemIds } from './shop-data.js';
import { getReputation, EMPTY_REPUTATION } from './reputation-data.js';

// Each achievement is independently unlockable — a profile can hold any
// number of these at once, ordered here by reward (roughly how hard they
// are to get) — used as the display order and to pick the single "best"
// badge shown next to a name elsewhere in the app. `reward` is the points
// paid out the first time it's claimed (profile.html, own profile only) —
// it's a display-only copy of the real reward table in claim_achievement()
// in schema.sql, which is what actually pays out and re-verifies
// eligibility server-side; keep the two in sync by hand.
export const ACHIEVEMENTS = [
  {
    id: 'viral',
    label: 'Viral',
    // Was "1,000 total views", which counted signed-out hits — the one
    // number on the site anybody could generate with a loop.
    description: '500 or more different people have opened your entries.',
    icon: 'eye',
    // Viral is Reached five times over and used to pay 90 against
    // Reached's 120, which also sorted it below Reached in this list —
    // and since the badge shown next to a name is the first unlocked
    // entry here, passing 500 viewers swapped your badge for a lesser one.
    reward: 200,
    check: (s) => s.uniqueViewers >= 500,
  },
  {
    id: 'icon',
    label: 'Icon',
    description: 'Received 100 or more likes across your projects.',
    icon: 'award',
    reward: 150,
    check: (s) => s.totalLikes >= 100,
  },
  {
    id: 'popular',
    label: 'Popular',
    description: '50 or more people follow you.',
    icon: 'users',
    reward: 140,
    check: (s) => s.followerCount >= 50,
  },
  {
    id: 'reached',
    label: 'Reached',
    description: '100 or more different people have opened your entries.',
    icon: 'eye',
    reward: 120,
    check: (s) => s.uniqueViewers >= 100,
  },
  {
    id: 'crowd-favorite',
    label: 'Crowd Favorite',
    description: 'Received 50 or more likes across your projects.',
    icon: 'flame',
    reward: 100,
    check: (s) => s.totalLikes >= 50,
  },
  {
    id: 'prolific',
    label: 'Prolific Creator',
    description: 'Published 10 or more projects.',
    icon: 'grid',
    reward: 90,
    check: (s) => s.projectsPublished >= 10,
  },
  {
    id: 'old-timer',
    label: 'Old Timer',
    description: 'Been part of Showcase for 2 years.',
    icon: 'star',
    reward: 90,
    check: (s) => s.accountAgeDays >= 730,
  },
  {
    id: 'influencer',
    label: 'Influencer',
    description: '10 or more people follow you.',
    icon: 'users',
    reward: 80,
    check: (s) => s.followerCount >= 10,
  },
  {
    id: 'talked-about',
    label: 'Talked About',
    description: 'Other people left 25 or more comments on your entries.',
    icon: 'message-circle',
    reward: 80,
    check: (s) => s.commentsReceived >= 25,
  },
  {
    id: 'chatterbox',
    label: 'Chatterbox',
    description: 'Posted 25 or more comments.',
    icon: 'message-circle',
    reward: 70,
    check: (s) => s.totalComments >= 25,
  },
  {
    id: 'collector',
    label: 'Collector',
    description: 'Own 5 or more items from the shop.',
    icon: 'shopping-bag',
    reward: 70,
    check: (s) => s.ownedItemsCount >= 5,
  },
  {
    id: 'builder',
    label: 'Builder',
    description: 'Published 5 or more projects.',
    icon: 'package',
    reward: 60,
    check: (s) => s.projectsPublished >= 5,
  },
  {
    id: 'trendsetter',
    label: 'Trendsetter',
    description: 'Equip a shop item in all three cosmetic slots (background, avatar border, nickname effect) at once.',
    icon: 'palette',
    reward: 60,
    check: (s) => s.stylized,
  },
  {
    id: 'veteran',
    label: 'Veteran',
    description: "Been part of Showcase for a year.",
    icon: 'star',
    reward: 50,
    check: (s) => s.accountAgeDays >= 365,
  },
  {
    id: 'conversationalist',
    label: 'Conversationalist',
    description: 'Posted 10 or more comments.',
    icon: 'message-circle',
    reward: 40,
    check: (s) => s.totalComments >= 10,
  },
  {
    id: 'well-liked',
    label: 'Well Liked',
    description: 'Received 10 or more likes across your projects.',
    icon: 'heart',
    reward: 30,
    check: (s) => s.totalLikes >= 10,
  },
  {
    id: 'social-butterfly',
    label: 'Social Butterfly',
    description: 'Follow 10 or more people.',
    icon: 'send',
    reward: 25,
    check: (s) => s.followingCount >= 10,
  },
  {
    id: 'launched',
    label: 'Launched',
    description: 'Published your first project.',
    icon: 'rocket',
    reward: 20,
    check: (s) => s.projectsPublished >= 1,
  },
  {
    id: 'all-set',
    label: 'All Set',
    description: 'Set both a bio and an avatar on your profile.',
    icon: 'shield-check',
    reward: 15,
    check: (s) => s.profileComplete,
  },
];

// Aggregates the stats every achievement check needs for one user.
//
// The reach numbers (entries, views, distinct viewers, likes, comments
// received, followers, xp) all arrive in the single user_reputation row —
// they used to be four separate queries plus a fifth for likes once the
// project ids were known. What's left alongside it is the handful of
// things reputation deliberately doesn't cover, because they measure
// participation rather than reach.
export async function getUserStats(userId) {
  // Every one of these is individually guarded. Without that, a single
  // failing query rejects the whole thing, and because the only caller
  // wraps it in a bare .catch() the entire progress chain — level chip,
  // achievement recording, toasts — vanishes with no error anywhere.
  const [reputation, followingCount, totalComments, profile, ownedItemIds] = await Promise.all([
    getReputation(userId).catch(() => ({ ...EMPTY_REPUTATION })),
    getFollowingCount(userId).catch(() => 0),
    getCommentCountByUser(userId).catch(() => 0),
    getProfile(userId).catch(() => null),
    getOwnedItemIds(userId).catch(() => new Set()),
  ]);

  const accountAgeDays = profile ? (Date.now() - new Date(profile.createdAt).getTime()) / 86_400_000 : 0;
  const profileComplete = Boolean(profile && profile.bio && profile.avatarUrl);
  const stylized = Boolean(
    profile && profile.equippedBg !== 'none' && profile.equippedBorder !== 'none' && profile.equippedNameEffect !== 'none'
  );

  return {
    projectsPublished: reputation.publishedProjects,
    totalLikes: reputation.likesReceived,
    totalViews: reputation.totalViews,
    uniqueViewers: reputation.uniqueViewers,
    commentsReceived: reputation.commentsReceived,
    followerCount: reputation.followers,
    // The server's number, carried through untouched — see js/levels.js.
    xp: reputation.xp,
    totalComments,
    followingCount,
    accountAgeDays,
    profileComplete,
    stylized,
    ownedItemsCount: ownedItemIds.size,
  };
}

// Achievements are permanent: once earned they stay earned, even if the
// activity behind them goes away (a project is deleted, likes are
// withdrawn, a follower leaves). `unlockedIds` carries the ids recorded
// server-side in unlocked_achievements — an achievement counts as unlocked
// if the live stats qualify *or* it's in that set. Callers that don't have
// the recorded set yet can omit it and still get live-stats behaviour.
function isUnlocked(achievement, stats, unlockedIds) {
  return (unlockedIds && unlockedIds.has(achievement.id)) || achievement.check(stats);
}

// Returns every achievement with an `unlocked` flag, in display order.
export function computeAchievements(stats, unlockedIds) {
  return ACHIEVEMENTS.map((a) => ({ ...a, unlocked: isUnlocked(a, stats, unlockedIds) }));
}

// The single most prestigious unlocked achievement — used for the compact
// badge shown next to a name (navbar chip, profile header). Null if none.
export function getTopAchievement(stats, unlockedIds) {
  return ACHIEVEMENTS.find((a) => isUnlocked(a, stats, unlockedIds)) || null;
}

// Achievements the live stats currently qualify for but that haven't been
// recorded server-side yet — the profile page records these so they stick
// from now on.
export function unrecordedAchievementIds(stats, unlockedIds) {
  return ACHIEVEMENTS.filter((a) => a.check(stats) && !unlockedIds.has(a.id)).map((a) => a.id);
}
