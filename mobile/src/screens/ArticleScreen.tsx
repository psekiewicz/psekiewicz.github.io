import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, Share, View } from 'react-native';

import { RichText } from '../components/RichText';
import { Text } from '../components/Text';
import { EmptyState, Loading } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { getArticle, getArticles, getIssue, isNewsEditor, NewsArticle, NewsIssue, periodLabel } from '../data/news';
import { column } from '../lib/layout';
import { safeUrl, timeAgo } from '../lib/utils';
import { useTheme } from '../theme/ThemeProvider';
import { gutter, radius, space, typography } from '../theme/tokens';

// One article, set like a news story: headline, lead, picture, the text and
// where it comes from. Reactions belong to the issue, so the way on is back to
// it, and to the rest of its articles. The native side of the site's /article.
export function ArticleScreen({ navigation, route }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const articleId: string = route.params?.articleId;

  const [article, setArticle] = useState<NewsArticle | null>(null);
  const [issue, setIssue] = useState<NewsIssue | null>(null);
  const [siblings, setSiblings] = useState<NewsArticle[]>([]);
  const [editor, setEditor] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const a = await getArticle(articleId);
      setArticle(a);
      if (a) {
        const [i, list, canEdit] = await Promise.all([
          getIssue(a.issueId),
          getArticles(a.issueId),
          user ? isNewsEditor() : Promise.resolve(false),
        ]);
        setIssue(i);
        setSiblings(list.filter((x) => x.id !== a.id));
        setEditor(canEdit);
      }
    } catch {
      setArticle(null);
    } finally {
      setLoading(false);
    }
  }, [articleId, user?.id]);

  useEffect(() => {
    load();
    return navigation.addListener('focus', load);
  }, [navigation, load]);

  useEffect(() => {
    if (issue) navigation.setOptions({ title: issue.title });
  }, [navigation, issue]);

  if (loading) return <Loading />;
  if (!article || !issue) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <EmptyState icon="globe" title="Article not found" body="It may have been taken down." />
      </View>
    );
  }

  const img = safeUrl(article.imageUrl);
  const src = safeUrl(article.sourceUrl);
  const period = periodLabel(issue);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ ...column(), padding: gutter, paddingBottom: space.xxl, gap: space.md }}>
      {period ? (
        <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700', letterSpacing: 0.6 }}>{period.toUpperCase()}</Text>
      ) : null}
      <Text style={[typography.h2, { color: colors.text }]}>{article.title}</Text>
      {article.lead ? <Text style={[typography.body, { color: colors.textMuted, fontSize: 16 }]}>{article.lead}</Text> : null}
      <Text style={{ color: colors.textFaint, fontSize: 12 }}>
        {article.authorName} · {timeAgo(article.createdAt)}
      </Text>
      {img ? <Image source={{ uri: img }} style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: radius.md }} contentFit="cover" /> : null}
      {article.body ? <RichText source={article.body} /> : null}
      {src ? (
        <Text style={[typography.small, { color: colors.textMuted }]}>
          Source:{' '}
          <Text onPress={() => Linking.openURL(src)} style={{ color: colors.primary }}>
            {article.sourceName || new URL(src).hostname} ↗
          </Text>
        </Text>
      ) : null}

      <View style={{ flexDirection: 'row', gap: space.xl, alignItems: 'center', marginTop: space.sm }}>
        <Pressable
          onPress={() => navigation.navigate('Issue', { issueId: issue.id })}
          hitSlop={8}
          accessibilityRole="button"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
        >
          <Feather name="message-circle" size={18} color={colors.textMuted} />
          <Text style={{ color: colors.textMuted }}>Discuss this issue</Text>
        </Pressable>
        <Pressable
          onPress={() => Share.share({ message: `${article.title} - https://psekiewicz.github.io/article?id=${article.id}` })}
          hitSlop={8}
          accessibilityRole="button"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
        >
          <Feather name="share-2" size={18} color={colors.textMuted} />
          <Text style={{ color: colors.textMuted }}>Share</Text>
        </Pressable>
        {editor ? (
          <Text
            onPress={() => navigation.navigate('NewsEditor', { mode: 'article', issueId: issue.id, articleId: article.id })}
            style={{ color: colors.textMuted, fontWeight: '700' }}
          >
            Edit
          </Text>
        ) : null}
      </View>

      {siblings.length ? (
        <View style={{ gap: space.sm, marginTop: space.lg, paddingTop: space.lg, borderTopWidth: 1.5, borderTopColor: colors.border }}>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>More in this issue</Text>
          {siblings.map((s) => (
            <Text
              key={s.id}
              onPress={() => navigation.push('Article', { articleId: s.id })}
              style={{ color: colors.primary, fontSize: 14 }}
            >
              {s.title}
            </Text>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}
