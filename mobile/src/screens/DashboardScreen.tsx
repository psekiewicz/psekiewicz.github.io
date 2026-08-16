import { Feather } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Body,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Eyebrow,
  Heading,
  Loading,
  Stat,
  Title,
  TypeBadge,
} from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { getMyProjects, Project, togglePublish } from '../data/projects';
import { getReputation, Reputation } from '../data/reputation';
import { getRecentViewTimestamps } from '../data/views';
import { levelFromXp } from '../lib/levels';
import { formatCount, timeAgo } from '../lib/utils';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, typography } from '../theme/tokens';

export function DashboardScreen({ navigation }: any) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [projects, setProjects] = useState<Project[]>([]);
  const [reputation, setReputation] = useState<Reputation | null>(null);
  const [viewSeries, setViewSeries] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setError('');
    try {
      const [rows, rep, timestamps] = await Promise.all([
        getMyProjects(user.id),
        getReputation(user.id).catch(() => null),
        getRecentViewTimestamps(14).catch(() => [] as string[]),
      ]);
      setProjects(rows);
      setReputation(rep);
      setViewSeries(bucketByDay(timestamps, 14));
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

  useEffect(() => navigation.addListener('focus', load), [navigation, load]);

  const flipPublish = async (project: Project) => {
    const next = !project.published;
    setProjects((prev) =>
      prev.map((p) => (p.id === project.id ? { ...p, published: next } : p))
    );
    try {
      await togglePublish(project.id, next);
    } catch (e: any) {
      setProjects((prev) =>
        prev.map((p) => (p.id === project.id ? { ...p, published: !next } : p))
      );
      setError(e.message);
    }
  };

  if (!user) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          padding: space.xl,
          justifyContent: 'center',
          gap: space.lg,
        }}
      >
        <Heading>Your dashboard</Heading>
        <Body muted>Sign in to manage what you've published.</Body>
        <Button label="Sign in" onPress={() => navigation.navigate('Login')} />
      </View>
    );
  }

  if (loading) return <Loading />;

  const level = reputation ? levelFromXp(reputation.xp) : null;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        padding: space.lg,
        paddingTop: insets.top + space.md,
        gap: space.md,
        paddingBottom: space.xxl,
      }}
      data={projects}
      keyExtractor={(item) => item.id}
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
        <View style={{ gap: space.lg, marginBottom: space.sm }}>
          <View>
            <Eyebrow>Dashboard</Eyebrow>
            <Title style={{ fontSize: 22 }}>Your work</Title>
          </View>

          <ErrorNote message={error} />

          <Card>
            <View style={{ flexDirection: 'row' }}>
              <Stat label="Entries" value={reputation?.publishedProjects ?? 0} />
              <Stat label="Views" value={formatCount(reputation?.totalViews ?? 0)} />
              <Stat label="Likes" value={formatCount(reputation?.likesReceived ?? 0)} />
              <Stat label="Followers" value={formatCount(reputation?.followers ?? 0)} />
            </View>
            {level ? (
              <View
                style={{
                  marginTop: space.lg,
                  paddingTop: space.md,
                  borderTopWidth: StyleSheet.hairlineWidth * 2,
                  borderTopColor: colors.border,
                }}
              >
                <Text style={[typography.small, { color: colors.textMuted }]}>
                  Level {level.level} · {level.xp} XP · {level.xpToNextLevel} to next
                </Text>
              </View>
            ) : null}
          </Card>

          <ViewsChart series={viewSeries} />

          <Button
            label="New entry"
            icon="plus"
            onPress={() => navigation.navigate('Editor', { projectId: undefined })}
          />

          <Eyebrow style={{ marginTop: space.sm }}>
            {projects.length} {projects.length === 1 ? 'entry' : 'entries'}
          </Eyebrow>
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          icon="package"
          title="Nothing published yet"
          body="Add your first entry and it shows up here."
        />
      }
      renderItem={({ item }) => (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <TypeBadge type={item.type} />
            <View style={{ flex: 1 }} />
            <Text
              style={[
                typography.eyebrow,
                { color: item.published ? colors.success : colors.textFaint },
              ]}
            >
              {item.published ? 'Live' : 'Draft'}
            </Text>
          </View>

          <Pressable
            onPress={() => navigation.navigate('ProjectDetail', { projectId: item.id })}
            style={{ marginTop: space.sm }}
          >
            <Text style={[typography.h3, { color: colors.text }]} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={[typography.small, { color: colors.textFaint, marginTop: 2 }]}>
              {timeAgo(item.createdAt)} · {formatCount(item.viewsCount)} views
            </Text>
          </Pressable>

          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
            <Button
              small
              label="Edit"
              icon="edit-2"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => navigation.navigate('Editor', { projectId: item.id })}
            />
            <Button
              small
              label={item.published ? 'Unpublish' : 'Publish'}
              icon={item.published ? 'eye-off' : 'upload'}
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => flipPublish(item)}
            />
          </View>
        </Card>
      )}
    />
  );
}

// Views per day for the last `days` days, oldest first.
function bucketByDay(timestamps: string[], days: number) {
  const buckets = new Array(days).fill(0);
  const now = Date.now();
  timestamps.forEach((ts) => {
    const age = Math.floor((now - new Date(ts).getTime()) / 86_400_000);
    if (age >= 0 && age < days) buckets[days - 1 - age] += 1;
  });
  return buckets;
}

// A plain bar chart drawn with views. A charting library for fourteen numbers
// would be more code than the chart.
function ViewsChart({ series }: { series: number[] }) {
  const { colors } = useTheme();
  const max = Math.max(1, ...series);
  const total = series.reduce((a, b) => a + b, 0);

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.md }}>
        <Eyebrow>Views · last 14 days</Eyebrow>
        <View style={{ flex: 1 }} />
        <Text style={[typography.small, { color: colors.textMuted }]}>{total} total</Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 60 }}>
        {series.map((value, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: `${Math.max(3, (value / max) * 100)}%`,
              backgroundColor: value > 0 ? colors.primary : colors.mutedSoft,
              borderRadius: radius.sm,
            }}
          />
        ))}
      </View>

      {total === 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.md }}>
          <Feather name="info" size={12} color={colors.textFaint} />
          <Text style={[typography.small, { color: colors.textFaint }]}>
            No views logged in this window yet.
          </Text>
        </View>
      ) : null}
    </Card>
  );
}
