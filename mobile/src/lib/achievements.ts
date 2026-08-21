import { getCommentCountByUser } from '../data/comments';
import { getFollowingCount } from '../data/follows';
import { getProfile } from '../data/profiles';
import { EMPTY_REPUTATION, getReputation } from '../data/reputation';
import { getOwnedItemIds } from '../data/shop';

// Each achievement is independently unlockable, ordered here by reward
// (roughly how hard it is to get) - used as the display order and to pick the
// single "best" badge shown next to a name. `reward` is a display-only copy of
// the real reward table in claim_achievement() in schema.sql, which is what
// actually pays out and re-verifies eligibility server-side.

export type Achievement = {
  id: string;
  label: string;
  description: string;
  icon: string;
  reward: number;
  check: (s: UserStats) => boolean;
};

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'icon', label: 'Icon', description: 'Received 100 or more likes across your projects.', icon: 'award', reward: 150, check: (s) => s.totalLikes >= 100 },
  { id: 'popular', label: 'Popular', description: '50 or more people follow you.', icon: 'users', reward: 140, check: (s) => s.followerCount >= 50 },
  { id: 'reached', label: 'Reached', description: '100 or more different people have opened your entries.', icon: 'eye', reward: 120, check: (s) => s.uniqueViewers >= 100 },
  { id: 'crowd-favorite', label: 'Crowd Favorite', description: 'Received 50 or more likes across your projects.', icon: 'zap', reward: 100, check: (s) => s.totalLikes >= 50 },
  { id: 'prolific', label: 'Prolific Creator', description: 'Published 10 or more projects.', icon: 'grid', reward: 90, check: (s) => s.projectsPublished >= 10 },
  { id: 'old-timer', label: 'Old Timer', description: 'Been part of Showcase for 2 years.', icon: 'star', reward: 90, check: (s) => s.accountAgeDays >= 730 },
  { id: 'viral', label: 'Viral', description: '500 or more different people have opened your entries.', icon: 'eye', reward: 90, check: (s) => s.uniqueViewers >= 500 },
  { id: 'influencer', label: 'Influencer', description: '10 or more people follow you.', icon: 'users', reward: 80, check: (s) => s.followerCount >= 10 },
  { id: 'talked-about', label: 'Talked About', description: 'Other people left 25 or more comments on your entries.', icon: 'message-circle', reward: 80, check: (s) => s.commentsReceived >= 25 },
  { id: 'chatterbox', label: 'Chatterbox', description: 'Posted 25 or more comments.', icon: 'message-circle', reward: 70, check: (s) => s.totalComments >= 25 },
  { id: 'collector', label: 'Collector', description: 'Own 5 or more items from the shop.', icon: 'shopping-bag', reward: 70, check: (s) => s.ownedItemsCount >= 5 },
  { id: 'builder', label: 'Builder', description: 'Published 5 or more projects.', icon: 'package', reward: 60, check: (s) => s.projectsPublished >= 5 },
  { id: 'trendsetter', label: 'Trendsetter', description: 'Equip a shop item in all three cosmetic slots at once.', icon: 'droplet', reward: 60, check: (s) => s.stylized },
  { id: 'veteran', label: 'Veteran', description: 'Been part of Showcase for a year.', icon: 'star', reward: 50, check: (s) => s.accountAgeDays >= 365 },
  { id: 'conversationalist', label: 'Conversationalist', description: 'Posted 10 or more comments.', icon: 'message-circle', reward: 40, check: (s) => s.totalComments >= 10 },
  { id: 'well-liked', label: 'Well Liked', description: 'Received 10 or more likes across your projects.', icon: 'heart', reward: 30, check: (s) => s.totalLikes >= 10 },
  { id: 'social-butterfly', label: 'Social Butterfly', description: 'Follow 10 or more people.', icon: 'send', reward: 25, check: (s) => s.followingCount >= 10 },
  { id: 'launched', label: 'Launched', description: 'Published your first project.', icon: 'flag', reward: 20, check: (s) => s.projectsPublished >= 1 },
  { id: 'all-set', label: 'All Set', description: 'Set both a bio and an avatar on your profile.', icon: 'check-circle', reward: 15, check: (s) => s.profileComplete },
];

export type UserStats = {
  projectsPublished: number;
  totalLikes: number;
  totalViews: number;
  uniqueViewers: number;
  commentsReceived: number;
  followerCount: number;
  xp: number;
  totalComments: number;
  followingCount: number;
  accountAgeDays: number;
  profileComplete: boolean;
  stylized: boolean;
  ownedItemsCount: number;
};

// Aggregates the stats every achievement check needs for one user. Every query
// is individually guarded: without that a single failure rejects the whole
// thing and the entire progress chain vanishes with no error anywhere.
export async function getUserStats(userId: string): Promise<UserStats> {
  const [reputation, followingCount, totalComments, profile, ownedItemIds] = await Promise.all([
    getReputation(userId).catch(() => ({ ...EMPTY_REPUTATION })),
    getFollowingCount(userId).catch(() => 0),
    getCommentCountByUser(userId).catch(() => 0),
    getProfile(userId).catch(() => null),
    getOwnedItemIds(userId).catch(() => new Set<string>()),
  ]);

  const accountAgeDays = profile
    ? (Date.now() - new Date(profile.createdAt).getTime()) / 86_400_000
    : 0;
  const profileComplete = Boolean(profile && profile.bio && profile.avatarUrl);
  const stylized = Boolean(
    profile &&
      profile.equippedBg !== 'none' &&
      profile.equippedBorder !== 'none' &&
      profile.equippedNameEffect !== 'none'
  );

  return {
    projectsPublished: reputation.publishedProjects,
    totalLikes: reputation.likesReceived,
    totalViews: reputation.totalViews,
    uniqueViewers: reputation.uniqueViewers,
    commentsReceived: reputation.commentsReceived,
    followerCount: reputation.followers,
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
// activity behind them goes away. An achievement counts as unlocked if the
// live stats qualify *or* it's in the recorded set.
function isUnlocked(a: Achievement, stats: UserStats, unlockedIds?: Set<string>) {
  return (unlockedIds && unlockedIds.has(a.id)) || a.check(stats);
}

export function computeAchievements(stats: UserStats, unlockedIds?: Set<string>) {
  return ACHIEVEMENTS.map((a) => ({ ...a, unlocked: isUnlocked(a, stats, unlockedIds) }));
}

// The single most prestigious unlocked achievement - the compact badge shown
// next to a name. Null if none.
export function getTopAchievement(stats: UserStats, unlockedIds?: Set<string>) {
  return ACHIEVEMENTS.find((a) => isUnlocked(a, stats, unlockedIds)) || null;
}

// Achievements the live stats currently qualify for but that haven't been
// recorded server-side yet - the profile screen records these so they stick.
export function unrecordedAchievementIds(stats: UserStats, unlockedIds: Set<string>) {
  return ACHIEVEMENTS.filter((a) => a.check(stats) && !unlockedIds.has(a.id)).map((a) => a.id);
}
