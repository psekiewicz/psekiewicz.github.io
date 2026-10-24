import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';

import { ProjectCard } from '../components/ProjectCard';
import { EmptyState, ErrorNote, Eyebrow, Loading } from '../components/ui';
import { Text } from '../components/Text';
import { getWeeklyIssues, Project } from '../data/projects';
import { column } from '../lib/layout';
import { useTheme } from '../theme/ThemeProvider';
import { space, typography } from '../theme/tokens';

// T&G Weekly: the tech and gaming news digest a scheduled task posts as CBot
// every Saturday. XOXD shows only demos everywhere else, and an issue is not a
// demo, so the issues have this screen of their own - the native side of the
// site's /weekly. Each opens on the ordinary entry screen.
export function WeeklyScreen({ navigation }: any) {
  const { colors } = useTheme();

  const [issues, setIssues] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setIssues(await getWeeklyIssues());
      setError('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <Loading />;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      data={issues}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ ...column(), padding: space.lg, gap: space.lg, paddingBottom: space.xxl }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
          tintColor={colors.primary}
          // tintColor is iOS-only; Android's spinner disc is white without these.
          colors={[colors.primary]}
          progressBackgroundColor={colors.surface}
        />
      }
      ListHeaderComponent={
        <View style={{ gap: space.xs }}>
          <ErrorNote message={error} />
          <Eyebrow>{'XOXD Tech & Gaming Weekly'}</Eyebrow>
          <Text style={[typography.small, { color: colors.textMuted }]}>
            The week in technology and games, with links to every source. A new issue every Saturday.
          </Text>
        </View>
      }
      ListEmptyComponent={
        <EmptyState icon="globe" title="No issues yet" body="The first one arrives on Saturday." />
      }
      renderItem={({ item, index }) => (
        <ProjectCard
          project={item}
          onPress={() => navigation.navigate('ProjectDetail', { projectId: item.id })}
          onAuthorPress={() => navigation.navigate('UserProfile', { userId: item.uid })}
          index={index}
        />
      )}
    />
  );
}
