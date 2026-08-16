import { Feather } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, EmptyState, ErrorNote, Loading } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import {
  getNotifications,
  markAllRead,
  Notification,
} from '../data/notifications';
import { getProfilesByIds, Profile } from '../data/profiles';
import { getProjectTitles } from '../data/projects';
import { timeAgo } from '../lib/utils';
import { useTheme } from '../theme/ThemeProvider';
import { space, typography } from '../theme/tokens';

const COPY: Record<string, { icon: any; verb: string }> = {
  like: { icon: 'heart', verb: 'liked' },
  comment: { icon: 'message-circle', verb: 'commented on' },
  follow: { icon: 'user-plus', verb: 'started following you' },
};

export function NotificationsScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();

  const [items, setItems] = useState<Notification[]>([]);
  const [actors, setActors] = useState<Map<string, Profile>>(new Map());
  const [titles, setTitles] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    getNotifications(50)
      .then(async (rows) => {
        setItems(rows);
        const [actorMap, titleMap] = await Promise.all([
          getProfilesByIds(rows.map((r) => r.actorId)).catch(() => new Map()),
          getProjectTitles(rows.map((r) => r.projectId).filter(Boolean) as string[]).catch(
            () => new Map()
          ),
        ]);
        setActors(actorMap);
        setTitles(titleMap);
        // Opening the screen is the read receipt — the badge on Home clears
        // when it refocuses.
        markAllRead().catch(() => {});
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [user?.id]);

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: space.xl, gap: space.lg, justifyContent: 'center' }}>
        <EmptyState
          icon="bell"
          title="Nothing to see"
          body="Sign in to get notified when people like, comment or follow."
          action={<Button label="Sign in" onPress={() => navigation.navigate('Login')} />}
        />
      </View>
    );
  }

  if (loading) return <Loading />;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: space.lg, gap: space.sm, paddingBottom: space.xxl }}
      ListHeaderComponent={<ErrorNote message={error} />}
      ListEmptyComponent={
        <EmptyState icon="bell" title="All quiet" body="Likes, comments and follows show up here." />
      }
      renderItem={({ item }) => {
        const actor = actors.get(item.actorId);
        const copy = COPY[item.type] || { icon: 'bell', verb: item.type };
        const title = item.projectId ? titles.get(item.projectId) : null;

        return (
          <Pressable
            onPress={() =>
              item.projectId
                ? navigation.navigate('ProjectDetail', { projectId: item.projectId })
                : navigation.navigate('UserProfile', { userId: item.actorId })
            }
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.md,
              padding: space.md,
              borderRadius: 5,
              borderWidth: StyleSheet.hairlineWidth * 2,
              borderColor: colors.border,
              backgroundColor: item.read ? 'transparent' : colors.surface,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Avatar url={actor?.avatarUrl} name={actor?.displayName} size={32} />
            <View style={{ flex: 1 }}>
              <Text style={[typography.body, { color: colors.text }]} numberOfLines={2}>
                <Text style={{ fontWeight: '700' }}>{actor?.displayName || 'Someone'}</Text>{' '}
                {copy.verb}
                {title ? <Text style={{ fontWeight: '700' }}> {title}</Text> : null}
              </Text>
              <Text style={[typography.small, { color: colors.textFaint }]}>{timeAgo(item.createdAt)}</Text>
            </View>
            <Feather name={copy.icon} size={15} color={colors.textFaint} />
          </Pressable>
        );
      }}
    />
  );
}
