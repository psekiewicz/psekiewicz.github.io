import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';

import { ProjectCard } from '../components/ProjectCard';
import { Button, EmptyState, ErrorNote, Eyebrow, Loading } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { getSavedProjects } from '../data/saves';
import { useTheme } from '../theme/ThemeProvider';
import { space } from '../theme/tokens';

// A private shelf - no counts, no public read policy, and saving something
// earns its author nothing.
export function SavedScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      setItems(await getSavedProjects(user.id));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <EmptyState
          icon="bookmark"
          title="Your shelf"
          body="Sign in to keep entries you want to come back to."
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
      contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
          tintColor={colors.primary}
        />
      }
      ListHeaderComponent={
        <View>
          <ErrorNote message={error} />
          <Eyebrow>{items.length} saved</Eyebrow>
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          icon="bookmark"
          title="Nothing saved yet"
          body="Tap the bookmark on an entry to keep it here."
        />
      }
      renderItem={({ item }) => (
        <ProjectCard
          project={item}
          onPress={() => navigation.navigate('ProjectDetail', { projectId: item.id })}
          onAuthorPress={() => navigation.navigate('UserProfile', { userId: item.uid })}
        />
      )}
    />
  );
}
