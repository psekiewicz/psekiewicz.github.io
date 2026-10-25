import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, View } from 'react-native';

import { CommentSource, CommentsSection } from '../components/CommentsSection';
import { ArticleDemos } from '../components/NewsAndDemos';
import { RichText } from '../components/RichText';
import { Text } from '../components/Text';
import { Badge, EmptyState, Loading } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { isAdmin } from '../data/admin';
import {
  addArticleComment,
  articleDate,
  deleteArticleComment,
  getArticle,
  getArticleComments,
  getArticles,
  getNewsletter,
  getReadIds,
  hasLikedArticle,
  canWriteNewsletter,
  isNewsEditor,
  likeArticle,
  markRead,
  NewsArticle,
  Newsletter,
  unlikeArticle,
} from '../data/news';
import { column } from '../lib/layout';
import { openLink } from '../lib/links';
import { safeUrl, timeAgo } from '../lib/utils';
import { useTheme } from '../theme/ThemeProvider';
import { gutter, radius, space, typography } from '../theme/tokens';

const ARTICLE_COMMENTS: CommentSource = { load: getArticleComments, add: addArticleComment, remove: deleteArticleComment };

// One article, set like a news story: headline, lead, picture, the text and
// where it comes from; then its likes and comments, and more from its
// newsletter. Opening it marks it read for this reader. The native side of
// the site's /article.
export function ArticleScreen({ navigation, route }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const articleId: string = route.params?.articleId;

  const [article, setArticle] = useState<NewsArticle | null>(null);
  const [letter, setLetter] = useState<Newsletter | null>(null);
  const [others, setOthers] = useState<NewsArticle[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState(false);
  const [moderator, setModerator] = useState(false);
  const [liked, setLiked] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const a = await getArticle(articleId);
      setArticle(a);
      if (a) {
        // Marked read as soon as it opens; a failure only means it stays "New".
        markRead(user?.id, a.id).catch(() => {});
        const [l, list, newsroom, writes, admin] = await Promise.all([
          getNewsletter(a.newsletterId),
          getArticles(a.newsletterId),
          user ? isNewsEditor() : Promise.resolve(false),
          user ? canWriteNewsletter(a.newsletterId) : Promise.resolve(false),
          user ? isAdmin(user.id).catch(() => false) : Promise.resolve(false),
        ]);
        const rest = list.filter((x) => x.id !== a.id).slice(0, 6);
        // The newsroom and the newsletter's owner edit anything in it and
        // moderate its comments; one of its editors edits their own.
        const manages = newsroom || Boolean(user && l?.createdBy === user.id);
        setLetter(l);
        setOthers(rest);
        setEditor(manages || (writes && a.authorId === user?.id));
        setModerator(manages || admin);
        setReadIds(await getReadIds(user?.id, rest.map((x) => x.id)).catch(() => new Set<string>()));
        if (user) setLiked(await hasLikedArticle(user.id, a.id).catch(() => false));
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
    if (letter) navigation.setOptions({ title: letter.title });
  }, [navigation, letter]);

  const toggleLike = async () => {
    if (!user) return navigation.navigate('Login');
    if (!article) return;
    const next = !liked;
    setLiked(next);
    setArticle({ ...article, likesCount: article.likesCount + (next ? 1 : -1) });
    try {
      if (next) await likeArticle(user.id, article.id);
      else await unlikeArticle(user.id, article.id);
    } catch (e: any) {
      setLiked(!next);
      setArticle(article);
      Alert.alert('Could not update the like', e.message);
    }
  };

  if (loading) return <Loading />;
  if (!article || !letter) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <EmptyState icon="globe" title="Article not found" body="It may have been taken down." />
      </View>
    );
  }

  const img = safeUrl(article.imageUrl);
  const src = safeUrl(article.sourceUrl);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ ...column(), padding: gutter, paddingBottom: space.xxl, gap: space.md }}>
      <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700', letterSpacing: 0.6 }}>{articleDate(article).toUpperCase()}</Text>
      <Text style={[typography.h2, { color: colors.text }]}>{article.title}</Text>
      {article.lead ? <Text style={[typography.body, { color: colors.textMuted, fontSize: 16 }]}>{article.lead}</Text> : null}
      <Text style={{ color: colors.textFaint, fontSize: 12 }}>
        {article.authorName} · {timeAgo(article.createdAt)}
      </Text>
      {img ? <Image source={{ uri: img }} style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: radius.md }} contentFit="cover" /> : null}
      {article.body ? <RichText source={article.body} /> : null}
      <ArticleDemos body={article.body} navigation={navigation} />
      {src ? (
        <Text style={[typography.small, { color: colors.textMuted }]}>
          Source:{' '}
          <Text onPress={() => openLink(src)} style={{ color: colors.primary }}>
            {article.sourceName || new URL(src).hostname} ↗
          </Text>
        </Text>
      ) : null}

      <View style={{ flexDirection: 'row', gap: space.xl, alignItems: 'center', marginTop: space.sm }}>
        <Pressable
          onPress={toggleLike}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={liked ? 'Unlike' : 'Like'}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
        >
          <Feather name="heart" size={19} color={liked ? colors.primary : colors.textMuted} />
          <Text style={{ color: colors.textMuted }}>{article.likesCount}</Text>
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
            onPress={() => navigation.navigate('NewsEditor', { mode: 'article', newsletterId: letter.id, articleId: article.id })}
            style={{ color: colors.textMuted, fontWeight: '700' }}
          >
            Edit
          </Text>
        ) : null}
      </View>

      <CommentsSection
        projectId={article.id}
        ownerId=""
        source={ARTICLE_COMMENTS}
        canModerate={moderator}
        onSignIn={() => navigation.navigate('Login')}
        onAuthorPress={(userId) => navigation.navigate('UserProfile', { userId })}
      />

      {others.length ? (
        <View style={{ gap: space.sm, marginTop: space.lg, paddingTop: space.lg, borderTopWidth: 1.5, borderTopColor: colors.border }}>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>More from {letter.title}</Text>
          {others.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => navigation.push('Article', { articleId: s.id })}
              accessibilityRole="link"
              style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}
            >
              <Text style={{ color: colors.primary, fontSize: 14, flexShrink: 1 }}>{s.title}</Text>
              {readIds.has(s.id) ? null : <Badge label="New" />}
            </Pressable>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}
