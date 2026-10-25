import { Feather } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Activity, ActivityKind, getActivity } from '../data/activity';
import { timeAgo } from '../lib/utils';
import { useTheme } from '../theme/ThemeProvider';
import { space, typography } from '../theme/tokens';
import { Text } from './Text';
import { EmptyState, ErrorNote, Loading } from './ui';

const ICONS: Record<ActivityKind, any> = {
  demo: 'play-circle',
  update: 'code',
  comment: 'message-circle',
  'news-comment': 'globe',
  achievement: 'award',
  item: 'shopping-bag',
};

// A profile's Activity tab: everything this person did across XOXD, newest
// first (data/activity.ts). Each line leads to what it's about - the demo,
// the article, the shop, or the Achievements tab (`onAchievements`).
export function ActivityList({
  userId,
  isSelf,
  navigation,
  onAchievements,
}: {
  userId: string;
  isSelf: boolean;
  navigation: any;
  onAchievements: () => void;
}) {
  const { colors } = useTheme();
  const [activity, setActivity] = useState<Activity[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setActivity(null);
    getActivity(userId).then(
      (list) => live && (setActivity(list), setError('')),
      (e) => live && (setActivity([]), setError(e.message))
    );
    return () => {
      live = false;
    };
  }, [userId]);

  const open = (a: Activity) => {
    const t = a.target;
    if (t.type === 'project') navigation.navigate('ProjectDetail', { projectId: t.id });
    else if (t.type === 'article') navigation.navigate('Article', { articleId: t.id });
    else if (t.type === 'shop') navigation.navigate('Shop');
    else onAchievements();
  };

  if (!activity) return <Loading />;
  if (error) return <ErrorNote message={error} />;
  if (!activity.length) {
    return (
      <EmptyState
        icon="activity"
        title="Nothing yet"
        body={isSelf ? 'Publish a demo, comment on one or on the news, and it shows up here.' : 'Nothing to show so far.'}
      />
    );
  }

  return (
    <View>
      {activity.map((a, i) => (
        <Pressable
          key={`${a.kind}-${a.at}-${i}`}
          onPress={() => open(a)}
          accessibilityRole="button"
          style={({ pressed }) => ({
            flexDirection: 'row',
            gap: space.md,
            paddingVertical: space.md,
            borderTopWidth: i ? StyleSheet.hairlineWidth * 2 : 0,
            borderTopColor: colors.border,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Feather name={ICONS[a.kind]} size={15} color={colors.textMuted} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[typography.body, { color: colors.text }]}>{a.text}</Text>
            {a.detail ? (
              <Text style={[typography.small, { color: colors.textMuted }]} numberOfLines={1}>
                “{a.detail}”
              </Text>
            ) : null}
            <Text style={{ color: colors.textFaint, fontSize: 11 }}>{timeAgo(a.at)}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}
