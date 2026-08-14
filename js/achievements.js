import { getPublishedProjectsByUser } from './projects-data.js';
import { getLikeCounts } from './likes-data.js';
import { getCommentCountByUser } from './comments-data.js';
import { getFollowerCount } from './follows-data.js';
import { getProfile } from './profiles-data.js';

// Each achievement is independently unlockable — a profile can hold any
// number of these at once, ordered here roughly by how hard they are to get
// (used as the display order and to pick the single "best" badge shown
// next to a name elsewhere in the app). `reward` is the points paid out
// the first time it's claimed (profile.html, own profile only) — it's a
// display-only copy of the real reward table in claim_achievement() in
// schema.sql, which is what actually pays out and re-verifies eligibility
// server-side; keep the two in sync by hand.
export const ACHIEVEMENTS = [
  {
    id: 'crowd-favorite',
    label: 'Crowd Favorite',
    description: 'Received 50 or more likes across your projects.',
    icon: 'flame',
    reward: 100,
    check: (s) => s.totalLikes >= 50,
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
    id: 'builder',
    label: 'Builder',
    description: 'Published 5 or more projects.',
    icon: 'package',
    reward: 60,
    check: (s) => s.projectsPublished >= 5,
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
    id: 'veteran',
    label: 'Veteran',
    description: "Been part of Showcase for a year.",
    icon: 'star',
    reward: 50,
    check: (s) => s.accountAgeDays >= 365,
  },
  {
    id: 'launched',
    label: 'Launched',
    description: 'Published your first project.',
    icon: 'rocket',
    reward: 20,
    check: (s) => s.projectsPublished >= 1,
  },
];

// Aggregates the stats every achievement check needs for one user. Reuses
// the same data-layer functions the rest of the app already calls — no new
// tables or RPCs required.
export async function getUserStats(userId) {
  const [projects, followerCount, totalComments, profile] = await Promise.all([
    getPublishedProjectsByUser(userId),
    getFollowerCount(userId).catch(() => 0),
    getCommentCountByUser(userId).catch(() => 0),
    getProfile(userId).catch(() => null),
  ]);

  const projectIds = projects.map((p) => p.id);
  const likeCounts = projectIds.length ? await getLikeCounts(projectIds).catch(() => new Map()) : new Map();
  const totalLikes = [...likeCounts.values()].reduce((sum, n) => sum + n, 0);
  const accountAgeDays = profile ? (Date.now() - new Date(profile.createdAt).getTime()) / 86_400_000 : 0;

  return {
    projectsPublished: projects.length,
    totalLikes,
    totalComments,
    followerCount,
    accountAgeDays,
  };
}

// Returns every achievement with an `unlocked` flag, in display order.
export function computeAchievements(stats) {
  return ACHIEVEMENTS.map((a) => ({ ...a, unlocked: a.check(stats) }));
}

// The single most prestigious unlocked achievement — used for the compact
// badge shown next to a name (navbar chip, profile header). Null if none.
export function getTopAchievement(stats) {
  return ACHIEVEMENTS.find((a) => a.check(stats)) || null;
}
