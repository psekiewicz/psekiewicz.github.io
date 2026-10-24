import { Image } from 'expo-image';
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';

import { Icon } from '../components/icons';
import { Text } from '../components/Text';
import { Button, EmptyState, ErrorNote, Loading } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { getArticleCounts, getIssues, isNewsEditor, NewsIssue, periodLabel } from '../data/news';
import { column } from '../lib/layout';
import { safeUrl } from '../lib/utils';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, typography } from '../theme/tokens';

// News: every issue, newest first - the native side of the site's /news.
// Anyone reads; news editors (granted by an admin) also see drafts and can
// start an issue. An issue opens on the Issue screen.
export function NewsScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();

  const [issues, setIssues] = useState<NewsIssue[]>([]);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [editor, setEditor] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [list, canEdit] = await Promise.all([getIssues(), user ? isNewsEditor() : Promise.resolve(false)]);
      setIssues(list);
      setEditor(canEdit);
      setCounts(await getArticleCounts(list.map((i) => i.id)).catch(() => new Map()));
      setError('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
    return navigation.addListener('focus', load);
  }, [navigation, load]);

  if (loading) return <Loading />;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      data={issues}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ ...column(), padding: space.lg, gap: space.md, paddingBottom: space.xxl }}
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
        <View style={{ gap: space.sm, marginBottom: space.sm }}>
          <ErrorNote message={error} />
          <Text style={[typography.small, { color: colors.textMuted }]}>
            The week in technology and games, one issue at a time - including XOXD Tech & Gaming Weekly, every Saturday.
          </Text>
          {editor ? (
            <Button label="New issue" icon="plus" small onPress={() => navigation.navigate('NewsEditor', { mode: 'issue' })} />
          ) : null}
        </View>
      }
      ListEmptyComponent={<EmptyState icon="globe" title="No issues yet" body="The first one arrives on Saturday." />}
      renderItem={({ item }) => {
        const cover = safeUrl(item.coverUrl);
        const period = periodLabel(item);
        const n = counts.get(item.id) || 0;
        return (
          <Pressable
            onPress={() => navigation.navigate('Issue', { issueId: item.id })}
            accessibilityRole="button"
            style={({ pressed }) => ({
              flexDirection: 'row',
              gap: space.md,
              padding: space.md,
              borderRadius: radius.lg,
              backgroundColor: colors.surface,
              borderWidth: 1.5,
              borderColor: colors.border,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <View
              style={{
                width: 96,
                height: 72,
                borderRadius: radius.sm,
                backgroundColor: colors.surfaceAlt,
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              {cover ? (
                <Image source={{ uri: cover }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
              ) : (
                <Icon name="globe" size={24} color={colors.textFaint} />
              )}
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              {period ? (
                <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700', letterSpacing: 0.6 }}>
                  {period.toUpperCase()}
                </Text>
              ) : null}
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }} numberOfLines={2}>
                {item.title}
                {item.published ? '' : '  (draft)'}
              </Text>
              {item.summary ? (
                <Text style={[typography.small, { color: colors.textMuted }]} numberOfLines={2}>
                  {item.summary}
                </Text>
              ) : null}
              <Text style={{ color: colors.textFaint, fontSize: 11 }}>
                {n} {n === 1 ? 'article' : 'articles'} · {item.likesCount} likes · {item.commentsCount} comments
              </Text>
            </View>
          </Pressable>
        );
      }}
    />
  );
}
