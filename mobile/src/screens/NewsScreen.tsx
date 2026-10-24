import { Image } from 'expo-image';
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';

import { Icon } from '../components/icons';
import { Text } from '../components/Text';
import { TopBar } from '../components/TopBar';
import { Badge, Button, EmptyState, ErrorNote, Loading } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { getArticleIdsByNewsletter, getNewsletters, getReadIds, isNewsEditor, Newsletter } from '../data/news';
import { column, TAB_BAR_CLEARANCE } from '../lib/layout';
import { safeUrl } from '../lib/utils';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, typography } from '../theme/tokens';

// News, a tab: the newsletters there are to read - the native side of the
// site's /news. Each says how many articles it holds and how many this reader hasn't
// opened; one opens on the Newsletter screen. News editors (granted by an
// admin) also see drafts and can start a newsletter.
export function NewsScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();

  const [letters, setLetters] = useState<Newsletter[]>([]);
  const [articleIds, setArticleIds] = useState<Map<string, string[]>>(new Map());
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [list, canEdit] = await Promise.all([getNewsletters(), user ? isNewsEditor() : Promise.resolve(false)]);
      const byLetter = await getArticleIdsByNewsletter(list.map((l) => l.id)).catch(() => new Map<string, string[]>());
      setLetters(list);
      setEditor(canEdit);
      setArticleIds(byLetter);
      setReadIds(await getReadIds(user?.id, [...byLetter.values()].flat()).catch(() => new Set<string>()));
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title="News" />
      {loading ? (
        <Loading />
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={letters}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ ...column(), padding: space.lg, gap: space.md, paddingBottom: TAB_BAR_CLEARANCE }}
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
                Newsletters from XOXD's editors - like Tech & Gaming Weekly, every Saturday. Pick one to see everything in it, and what you haven't read yet.
              </Text>
              {editor ? (
                <Button label="New newsletter" icon="plus" small onPress={() => navigation.navigate('NewsEditor', { mode: 'newsletter' })} />
              ) : null}
            </View>
          }
          ListEmptyComponent={<EmptyState icon="globe" title="No newsletters yet" body="The first one is on its way." />}
          renderItem={({ item }) => {
            const cover = safeUrl(item.coverUrl);
            const ids = articleIds.get(item.id) || [];
            const n = ids.length;
            const unread = ids.filter((id) => !readIds.has(id)).length;
            return (
              <Pressable
                onPress={() => navigation.navigate('Newsletter', { newsletterId: item.id })}
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
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }} numberOfLines={2}>
                    {item.title}
                    {item.published ? '' : '  (draft)'}
                  </Text>
                  {item.summary ? (
                    <Text style={[typography.small, { color: colors.textMuted }]} numberOfLines={2}>
                      {item.summary}
                    </Text>
                  ) : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <Text style={{ color: colors.textFaint, fontSize: 11 }}>
                      {n} {n === 1 ? 'article' : 'articles'}
                    </Text>
                    {unread ? <Badge label={`${unread} new`} /> : n ? <Badge label="All read" tone="quiet" /> : null}
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
