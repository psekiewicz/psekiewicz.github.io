import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar, Button, DisplayName, EmptyState, ErrorNote, Eyebrow, LevelChip, Loading } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { followUser, getFollowingIds, unfollowUser } from '../data/follows';
import { getProfilesByIds, Profile } from '../data/profiles';
import { getTopByXp, Reputation } from '../data/reputation';
import { levelFromXp } from '../lib/levels';
import { formatCount } from '../lib/utils';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, typography } from '../theme/tokens';

// The board shows the top 50, but search looks through everyone with XP, as
// leaderboard.html does - it doubles as the way to find people by name.
const TOP_N = 50;
const POOL = 1000;

export function LeaderboardScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [rows, setRows] = useState<Reputation[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // Ranked by the server rather than by pulling every profile and sorting
    // here - the view already knows the order.
    getTopByXp(POOL)
      .then(async (top) => {
        setRows(top);
        const map = await getProfilesByIds(top.map((r) => r.userId)).catch(() => new Map());
        setProfiles(map);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    getFollowingIds(user?.id ?? null)
      .then(setFollowingIds)
      .catch(() => setFollowingIds(new Set()));
  }, [user?.id]);

  // Ranks stay absolute: filtering by name must not renumber people, or
  // searching would tell you someone is #1 when they're #23.
  const ranked = useMemo(() => rows.map((row, i) => ({ row, rank: i + 1 })), [rows]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) {
      return ranked.filter((e) =>
        (profiles.get(e.row.userId)?.displayName || '').toLowerCase().includes(q)
      );
    }
    const top = ranked.slice(0, TOP_N);
    // If you didn't make the cut, your own standing goes underneath rather
    // than leaving you to wonder where you are.
    const mine = user ? ranked.find((e) => e.row.userId === user.id) : undefined;
    return mine && mine.rank > TOP_N ? [...top, mine] : top;
  }, [ranked, profiles, query, user]);

  const toggleFollow = async (targetId: string) => {
    if (!user) return navigation.navigate('Login');
    const wasFollowing = followingIds.has(targetId);
    setBusyId(targetId);
    try {
      if (wasFollowing) await unfollowUser(user.id, targetId);
      else await followUser(user.id, targetId);
      setFollowingIds((prev) => {
        const next = new Set(prev);
        if (wasFollowing) next.delete(targetId);
        else next.add(targetId);
        return next;
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <Loading />;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      data={visible}
      keyExtractor={(item) => item.row.userId}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: space.lg, gap: space.sm, paddingBottom: space.xxl }}
      ListHeaderComponent={
        <View style={{ marginBottom: space.sm, gap: space.xs }}>
          <ErrorNote message={error} />
          <Eyebrow>Ranked by XP</Eyebrow>
          <Text style={[typography.small, { color: colors.textFaint }]}>
            XP comes only from what other people did with your work.
          </Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search people by name"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={{
              marginTop: space.md,
              color: colors.text,
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderWidth: 1.5,
              borderRadius: radius.pill,
              paddingHorizontal: space.lg,
              paddingVertical: 10,
              fontSize: 14,
            }}
          />
        </View>
      }
      ListEmptyComponent={
        query.trim() ? (
          <EmptyState icon="search" title="Nobody found" body={`No one matches “${query.trim()}”.`} />
        ) : (
          <EmptyState icon="award" title="Nobody's on the board yet" body="XP shows up here once work starts getting seen." />
        )
      }
      renderItem={({ item }) => {
        const { row, rank } = item;
        const profile = profiles.get(row.userId);
        const level = levelFromXp(row.xp);
        const isMe = user?.id === row.userId;
        const follows = followingIds.has(row.userId);
        return (
          <View>
            {/* The gap before your own row when it's appended below the top 50. */}
            {!query.trim() && rank > TOP_N ? (
              <Text style={{ textAlign: 'center', color: colors.textFaint, marginBottom: space.sm }}>…</Text>
            ) : null}
            <Pressable
              onPress={() => navigation.navigate('UserProfile', { userId: row.userId })}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                padding: space.md,
                borderRadius: 5,
                borderWidth: StyleSheet.hairlineWidth * 2,
                borderColor: isMe ? colors.primary : colors.border,
                backgroundColor: colors.surface,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text
                style={{
                  minWidth: 24,
                  fontWeight: '700',
                  fontSize: 13,
                  color: rank <= 3 ? colors.primary : colors.textFaint,
                }}
              >
                {rank}
              </Text>
              <Avatar
                url={profile?.avatarUrl}
                name={profile?.displayName}
                size={34}
                ring={profile?.equippedBorder}
              />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {/* The site's leaderboard wears the equipped name effect here
                      (leaderboard.html); a plain Text dropped it on the floor. */}
                  <DisplayName
                    name={profile?.displayName || 'Unknown'}
                    effect={profile?.equippedNameEffect}
                    style={{ fontSize: 13, flexShrink: 1 }}
                  />
                  <LevelChip level={level.level} small />
                </View>
                <Text style={[typography.small, { color: colors.textFaint }]} numberOfLines={1}>
                  {formatCount(row.xp)} XP · {formatCount(row.followers)} followers
                </Text>
              </View>
              {/* A sibling of the row's own press target in spirit: its tap
                  follows rather than opening the profile. Hidden on your own
                  row, and for signed-out viewers, as on the site. */}
              {user && !isMe ? (
                <Button
                  small
                  label={follows ? 'Following' : 'Follow'}
                  variant={follows ? 'secondary' : 'primary'}
                  loading={busyId === row.userId}
                  onPress={() => toggleFollow(row.userId)}
                />
              ) : isMe ? (
                <Text style={[typography.small, { color: colors.primary, fontWeight: '700' }]}>you</Text>
              ) : null}
            </Pressable>
          </View>
        );
      }}
    />
  );
}
