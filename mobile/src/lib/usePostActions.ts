import { useCallback, useState } from 'react';
import { Share } from 'react-native';

import { likeProject, unlikeProject } from '../data/likes';
import type { Project } from '../data/projects';
import { saveProject, unsaveProject } from '../data/saves';

// Like, save and share for a list of posts, with the counts and filled states
// the list needs to draw them. Taps land immediately and are rolled back if the
// server refuses; signed-out taps go to `onSignInNeeded` instead.
export function usePostActions(userId: string | null, onSignInNeeded: () => void) {
  const [likeCounts, setLikeCounts] = useState<Map<string, number>>(new Map());
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());

  const flip = (set: Set<string>, id: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  };
  const bump = (map: Map<string, number>, id: string, delta: number) =>
    new Map(map).set(id, Math.max(0, (map.get(id) || 0) + delta));

  const toggleLike = useCallback(
    async (projectId: string) => {
      if (!userId) return onSignInNeeded();
      const on = !liked.has(projectId);
      setLiked((s) => flip(s, projectId, on));
      setLikeCounts((m) => bump(m, projectId, on ? 1 : -1));
      try {
        await (on ? likeProject(userId, projectId) : unlikeProject(userId, projectId));
      } catch {
        setLiked((s) => flip(s, projectId, !on));
        setLikeCounts((m) => bump(m, projectId, on ? -1 : 1));
      }
    },
    [userId, liked, onSignInNeeded]
  );

  const toggleSave = useCallback(
    async (projectId: string) => {
      if (!userId) return onSignInNeeded();
      const on = !saved.has(projectId);
      setSaved((s) => flip(s, projectId, on));
      try {
        await (on ? saveProject(userId, projectId) : unsaveProject(userId, projectId));
      } catch {
        setSaved((s) => flip(s, projectId, !on));
      }
    },
    [userId, saved, onSignInNeeded]
  );

  const share = useCallback((project: Project) => {
    Share.share({ message: `${project.title} - https://psekiewicz.github.io/project.html?id=${project.id}` });
  }, []);

  return { likeCounts, setLikeCounts, liked, setLiked, saved, setSaved, toggleLike, toggleSave, share };
}
