import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { LinearGradient } from 'expo-linear-gradient';

import { SectionRule, StatBlock, TonePill } from '../components/bloom';
import { TopBar } from '../components/TopBar';
import { placeholderFor } from '../components/ProjectCard';
import { ProgressRing } from '../components/ProgressRing';
import { Body, Button, Card, EmptyState, ErrorNote, Heading, Loading } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { getMyProjects, Project, togglePublish } from '../data/projects';
import { getReputation, Reputation } from '../data/reputation';
import { getRecentViewTimestamps } from '../data/views';
import { levelFromXp } from '../lib/levels';
import { formatCount, timeAgo } from '../lib/utils';
import { useMotion } from '../theme/MotionProvider';
import { column } from '../lib/layout';
import { useTheme } from '../theme/ThemeProvider';
import { gutter, radius, space, typography } from '../theme/tokens';

export function DashboardScreen({ navigation }: any) {
  const { colors } = useTheme();
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

  const views = reputation?.totalViews ?? 0;
  const entries = reputation?.publishedProjects ?? 0;
  // The ring reads as "how much of your work is live", which is the one
  // proportion on this screen that actually has a denominator.
  const liveShare = projects.length ? entries / projects.length : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title="Your work" />

      <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={{
        ...column(),
        paddingHorizontal: gutter,
        paddingTop: 20,
        gap: 12,
        paddingBottom: 116,
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
          // tintColor is iOS-only; Android's spinner disc is white without these.
          colors={[colors.primary]}
          progressBackgroundColor={colors.surface}
        />
      }
      ListHeaderComponent={
        <View style={{ gap: 18, marginBottom: 6 }}>
          <ErrorNote message={error} />

          {/* The numbers used to sit in a block of sage above the list. They
              read the same on the page ground and cost 150px less. */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 18,
              padding: 16,
              borderRadius: radius.md,
              backgroundColor: colors.surface,
              borderWidth: StyleSheet.hairlineWidth * 2,
              borderColor: colors.border,
            }}
          >
            <ProgressRing
              progress={liveShare}
              value={formatCount(views)}
              label="Views"
              color={colors.primary}
              trackColor={colors.mutedSoft}
            />
            <View style={{ flex: 1, gap: 10 }}>
              <StatBlock size={22} value={formatCount(reputation?.likesReceived ?? 0)} label="Likes" />
              <StatBlock size={22} value={formatCount(reputation?.followers ?? 0)} label="Followers" />
              <StatBlock size={22} value={entries} label="Entries" />
            </View>
          </View>

          <ViewsChart series={viewSeries} />

          {level ? (
            <Text style={[typography.small, { color: colors.textMuted }]}>
              Level {level.level} · {level.xp} XP · {level.xpToNextLevel} to next
            </Text>
          ) : null}

          <Button
            label="New entry"
            icon="plus"
            onPress={() => navigation.navigate('Editor', { projectId: undefined })}
          />

          <SectionRule label="Entries" trailing={projects.length} />
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
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: radius.md,
            padding: 14,
            gap: 12,
          }}
        >
          <Pressable
            onPress={() => navigation.navigate('ProjectDetail', { projectId: item.id })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}
          >
            <LinearGradient
              colors={placeholderFor(item.type) as any}
              start={{ x: 0.15, y: 0 }}
              end={{ x: 0.85, y: 1 }}
              style={{ width: 50, height: 50, borderRadius: 16 }}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[typography.rowTitle, { color: colors.text }]} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
                {item.published
                  ? `${formatCount(item.viewsCount)} views · ${timeAgo(item.createdAt)}`
                  : 'Not published'}
              </Text>
            </View>
            <TonePill label={item.published ? 'LIVE' : 'DRAFT'} tone={item.published ? 'accent' : 'primary'} />
          </Pressable>

          <View style={{ flexDirection: 'row', gap: space.sm }}>
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
        </View>
      )}
    />
    </View>
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
// would be more code than the chart. Bloom ramps the bars from the pale sand
// steps up to the accent across the window, so the recent end reads hottest.
function ViewsChart({ series }: { series: number[] }) {
  const { colors } = useTheme();
  const { enabled } = useMotion();
  const max = Math.max(1, ...series);
  const total = series.reduce((a, b) => a + b, 0);
  const grow = useRef(new Animated.Value(enabled ? 0 : 1)).current;

  useEffect(() => {
    if (!enabled) return;
    Animated.timing(grow, { toValue: 1, duration: 700, useNativeDriver: true }).start();
  }, [grow, enabled]);

  const barColor = (i: number) => {
    const at = i / Math.max(1, series.length - 1);
    if (at < 0.25) return colors.border;
    if (at < 0.5) return colors.sand;
    return colors.primary;
  };

  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 24, padding: 18, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={[typography.label, { letterSpacing: 1.8, color: colors.accent }]}>
          Daily views
        </Text>
        <View style={{ flex: 1 }} />
        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primaryDeep }}>
          {total} total
        </Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 70 }}>
        {series.map((value, i) => (
          <Animated.View
            key={i}
            style={{
              flex: 1,
              height: `${Math.max(8, (value / max) * 100)}%`,
              backgroundColor: barColor(i),
              borderRadius: 6,
              // RN scales about the centre by default; the artboard grows each
              // bar out of the axis.
              transformOrigin: 'bottom',
              transform: [{ scaleY: grow }],
            }}
          />
        ))}
      </View>

      {total === 0 ? (
        <Text style={[typography.small, { color: colors.textFaint }]}>
          No views logged in this window yet.
        </Text>
      ) : null}
    </View>
  );
}
