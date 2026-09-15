import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet } from 'react-native';
import { Text } from '../components/Text';

import { Avatar, EmptyState, ErrorNote, Loading } from '../components/ui';
import { getFollowers, getFollowing, MiniProfile } from '../data/follows';
import { useTheme } from '../theme/ThemeProvider';
import { space } from '../theme/tokens';

// The site's followers/following modal (profile.html), as a screen: a profile
// is a stack screen itself, so each row can push another one.
export function FollowListScreen({ route, navigation }: any) {
  const { colors } = useTheme();
  const { userId, mode } = route.params as { userId: string; mode: 'followers' | 'following' };

  const [people, setPeople] = useState<MiniProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    navigation.setOptions({ title: mode === 'followers' ? 'Followers' : 'Following' });
    (mode === 'followers' ? getFollowers(userId) : getFollowing(userId))
      .then((rows) => setPeople([...rows].sort((a, b) => a.displayName.localeCompare(b.displayName))))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [userId, mode, navigation]);

  if (loading) return <Loading />;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      data={people}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: space.lg, gap: space.sm, paddingBottom: space.xxl }}
      ListHeaderComponent={<ErrorNote message={error} />}
      ListEmptyComponent={
        error ? null : (
          <EmptyState
            icon="users"
            title={mode === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
            body={
              mode === 'followers'
                ? 'People who follow this account show up here.'
                : 'Accounts this person follows show up here.'
            }
          />
        )
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => navigation.push('UserProfile', { userId: item.id })}
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
          <Avatar url={item.avatarUrl} name={item.displayName} size={38} />
          <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: colors.text }} numberOfLines={1}>
            {item.displayName}
          </Text>
        </Pressable>
      )}
    />
  );
}
