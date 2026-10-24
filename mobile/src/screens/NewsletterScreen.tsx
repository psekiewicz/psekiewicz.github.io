import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, View } from 'react-native';

import { Text } from '../components/Text';
import { Badge, Button, EmptyState, ErrorNote, Loading } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import {
  articleDate,
  deleteNewsletter,
  getArticles,
  getNewsletter,
  getReadIds,
  isNewsEditor,
  NewsArticle,
  Newsletter,
} from '../data/news';
import { column } from '../lib/layout';
import { safeUrl } from '../lib/utils';
import { useTheme } from '../theme/ThemeProvider';
import { gutter, radius, space, typography } from '../theme/tokens';

// One newsletter: every article in it, newest first, each marked "New" until
// this reader has opened it. News editors also get the controls to edit the
// newsletter and add, edit or remove articles. Likes and comments are on each
// article. The native side of the site's /newsletter.
export function NewsletterScreen({ navigation, route }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const newsletterId: string = route.params?.newsletterId;

  const [letter, setLetter] = useState<Newsletter | null>(null);
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Runs again whenever the screen comes back into view, so an article just
  // read stops saying "New".
  const load = useCallback(async () => {
    try {
      const [l, list, canEdit] = await Promise.all([
        getNewsletter(newsletterId),
        getArticles(newsletterId),
        user ? isNewsEditor() : Promise.resolve(false),
      ]);
      setLetter(l);
      setArticles(list);
      setEditor(canEdit);
      setReadIds(await getReadIds(user?.id, list.map((a) => a.id)).catch(() => new Set<string>()));
      setError('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [newsletterId, user?.id]);

  useEffect(() => {
    load();
    return navigation.addListener('focus', load);
  }, [navigation, load]);

  useEffect(() => {
    if (letter) navigation.setOptions({ title: letter.title });
  }, [navigation, letter]);

  const confirmDelete = () => {
    if (!letter) return;
    Alert.alert('Delete this newsletter?', `"${letter.title}" and all ${articles.length} of its articles go. This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteNewsletter(letter.id);
            navigation.goBack();
          } catch (e: any) {
            Alert.alert('Could not delete', e.message);
          }
        },
      },
    ]);
  };

  if (loading) return <Loading />;
  if (!letter) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <EmptyState icon="globe" title="Newsletter not found" body={error || 'It may have been taken down.'} />
      </View>
    );
  }

  const cover = safeUrl(letter.coverUrl);
  const unread = articles.filter((a) => !readIds.has(a.id)).length;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ ...column(), padding: gutter, paddingBottom: space.xxl, gap: space.lg }}>
      <ErrorNote message={error} />
      <View style={{ gap: space.sm }}>
        <Text style={[typography.h2, { color: colors.text }]}>
          {letter.title}
          {letter.published ? '' : '  (draft)'}
        </Text>
        {letter.summary ? <Text style={[typography.body, { color: colors.textMuted }]}>{letter.summary}</Text> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Text style={{ color: colors.textFaint, fontSize: 12 }}>
            {articles.length} {articles.length === 1 ? 'article' : 'articles'}
          </Text>
          {unread ? <Badge label={`${unread} new`} /> : articles.length ? <Badge label="All read" tone="quiet" /> : null}
          <Pressable
            onPress={() => Share.share({ message: `${letter.title} - https://psekiewicz.github.io/newsletter?id=${letter.id}` })}
            hitSlop={8}
            accessibilityRole="button"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
          >
            <Feather name="share-2" size={15} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>Share</Text>
          </Pressable>
        </View>
        {cover ? (
          <Image source={{ uri: cover }} style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: radius.md }} contentFit="cover" />
        ) : null}
        {editor ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            <Button label="Add article" icon="plus" small onPress={() => navigation.navigate('NewsEditor', { mode: 'article', newsletterId: letter.id })} />
            <Button
              label="Edit newsletter"
              icon="edit-2"
              small
              variant="secondary"
              onPress={() => navigation.navigate('NewsEditor', { mode: 'newsletter', newsletterId: letter.id })}
            />
            <Button label="Delete" icon="trash-2" small variant="secondary" onPress={confirmDelete} />
          </View>
        ) : null}
      </View>

      <View style={{ borderTopWidth: 1.5, borderTopColor: colors.border }}>
        {articles.length === 0 ? (
          <Text style={[typography.small, { color: colors.textFaint, paddingVertical: space.lg }]}>Nothing in this newsletter yet.</Text>
        ) : (
          articles.map((a) => {
            const img = safeUrl(a.imageUrl);
            const read = readIds.has(a.id);
            return (
              <Pressable
                key={a.id}
                onPress={() => navigation.navigate('Article', { articleId: a.id })}
                accessibilityRole="button"
                accessibilityLabel={`${a.title}${read ? ', read' : ', new'}`}
                style={({ pressed }) => ({
                  paddingVertical: space.lg,
                  gap: space.sm,
                  borderBottomWidth: 1.5,
                  borderBottomColor: colors.border,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                {img ? <Image source={{ uri: img }} style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: radius.sm }} contentFit="cover" /> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  {read ? <Badge label="Read" tone="quiet" /> : <Badge label="New" />}
                  <Text style={{ color: colors.textFaint, fontSize: 12 }}>{articleDate(a)}</Text>
                </View>
                <Text style={{ color: read ? colors.textMuted : colors.text, fontWeight: '700', fontSize: 16 }}>{a.title}</Text>
                {a.lead ? <Text style={[typography.small, { color: colors.textMuted }]}>{a.lead}</Text> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                  <Text style={{ color: colors.textFaint, fontSize: 12 }}>
                    ♥ {a.likesCount} · {a.commentsCount} {a.commentsCount === 1 ? 'comment' : 'comments'}
                  </Text>
                  {editor ? (
                    <Text
                      onPress={() => navigation.navigate('NewsEditor', { mode: 'article', newsletterId: letter.id, articleId: a.id })}
                      style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700' }}
                    >
                      Edit
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}
