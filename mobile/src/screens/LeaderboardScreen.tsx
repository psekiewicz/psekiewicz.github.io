import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, EmptyState, ErrorNote, Eyebrow, LevelChip, Loading } from '../components/ui';
import { getProfilesByIds, Profile } from '../data/profiles';
import { getTopByXp, Reputation } from '../data/reputation';
import { levelFromXp } from '../lib/levels';
import { formatCount } from '../lib/utils';
import { useTheme } from '../theme/ThemeProvider';
import { space, typography } from '../theme/tokens';

export function LeaderboardScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [rows, setRows] = useState<Reputation[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // Ranked by the server rather than by pulling every profile and sorting
    // here — the view already knows the order.
    getTopByXp(50)
      .then(async (top) => {
        setRows(top);
        const map = await getProfilesByIds(top.map((r) => r.userId)).catch(() => new Map());
        setProfiles(map);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      data={rows}
      keyExtractor={(item) => item.userId}
      contentContainerStyle={{ padding: space.lg, gap: space.sm, paddingBottom: space.xxl }}
      ListHeaderComponent={
        <View style={{ marginBottom: space.sm }}>
          <ErrorNote message={error} />
          <Eyebrow>Ranked by XP</Eyebrow>
          <Text style={[typography.small, { color: colors.textFaint, marginTop: 4 }]}>
            XP comes only from what other people did with your work.
          </Text>
        </View>
      }
      ListEmptyComponent={
        <EmptyState icon="award" title="Nobody's on the board yet" body="XP shows up here once work starts getting seen." />
      }
      renderItem={({ item, index }) => {
        const profile = profiles.get(item.userId);
        const level = levelFromXp(item.xp);
        return (
          <Pressable
            onPress={() => navigation.navigate('UserProfile', { userId: item.userId })}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.md,
              padding: space.md,
              borderRadius: 5,
              borderWidth: StyleSheet.hairlineWidth * 2,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text
              style={{
                width: 24,
                fontWeight: '700',
                fontSize: 13,
                color: index < 3 ? colors.primary : colors.textFaint,
              }}
            >
              {index + 1}
            </Text>
            <Avatar
              url={profile?.avatarUrl}
              name={profile?.displayName}
              size={34}
              ring={profile?.equippedBorder}
            />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontWeight: '700', fontSize: 13, color: colors.text }} numberOfLines={1}>
                  {profile?.displayName || 'Unknown'}
                </Text>
                <LevelChip level={level.level} small />
              </View>
              <Text style={[typography.small, { color: colors.textFaint }]}>
                {formatCount(item.likesReceived)} likes · {formatCount(item.uniqueViewers)} viewers ·{' '}
                {formatCount(item.followers)} followers
              </Text>
            </View>
            <Text style={{ fontWeight: '700', fontSize: 13, color: colors.text }}>
              {formatCount(item.xp)}
            </Text>
          </Pressable>
        );
      }}
    />
  );
}
