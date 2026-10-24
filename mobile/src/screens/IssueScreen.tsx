import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Share, View } from 'react-native';

import { CommentSource, CommentsSection } from '../components/CommentsSection';
import { Text } from '../components/Text';
import { Button, EmptyState, ErrorNote, Loading } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { isAdmin } from '../data/admin';
import {
  addIssueComment,
  deleteIssue,
  deleteIssueComment,
  getArticles,
  getIssue,
  getIssueComments,
  hasLikedIssue,
  isNewsEditor,
  likeIssue,
  NewsArticle,
  NewsIssue,
  periodLabel,
  unlikeIssue,
} from '../data/news';
import { column } from '../lib/layout';
import { safeUrl } from '../lib/utils';
import { useTheme } from '../theme/ThemeProvider';
import { gutter, radius, space, typography } from '../theme/tokens';

const ISSUE_COMMENTS: CommentSource = { load: getIssueComments, add: addIssueComment, remove: deleteIssueComment };

// One issue: its articles in order, then the issue's likes and comments
// (people react to the week as a whole). News editors also get the controls
// to edit the issue and add, edit or remove articles. The native side of the
// site's /issue.
export function IssueScreen({ navigation, route }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const issueId: string = route.params?.issueId;

  const [issue, setIssue] = useState<NewsIssue | null>(null);
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [editor, setEditor] = useState(false);
  const [moderator, setModerator] = useState(false);
  const [liked, setLiked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [i, list, canEdit, admin] = await Promise.all([
        getIssue(issueId),
        getArticles(issueId),
        user ? isNewsEditor() : Promise.resolve(false),
        user ? isAdmin(user.id).catch(() => false) : Promise.resolve(false),
      ]);
      setIssue(i);
      setArticles(list);
      setEditor(canEdit);
      setModerator(canEdit || admin);
      if (user && i) setLiked(await hasLikedIssue(user.id, i.id).catch(() => false));
      setError('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [issueId, user?.id]);

  useEffect(() => {
    load();
    return navigation.addListener('focus', load);
  }, [navigation, load]);

  useEffect(() => {
    if (issue) navigation.setOptions({ title: issue.title });
  }, [navigation, issue]);

  const toggleLike = async () => {
    if (!user) return navigation.navigate('Login');
    if (!issue) return;
    const next = !liked;
    setLiked(next);
    setIssue({ ...issue, likesCount: issue.likesCount + (next ? 1 : -1) });
    try {
      if (next) await likeIssue(user.id, issue.id);
      else await unlikeIssue(user.id, issue.id);
    } catch (e: any) {
      setLiked(!next);
      setIssue(issue);
      Alert.alert('Could not update the like', e.message);
    }
  };

  const confirmDelete = () => {
    if (!issue) return;
    Alert.alert('Delete this issue?', `"${issue.title}" and all ${articles.length} of its articles go. This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteIssue(issue.id);
            navigation.goBack();
          } catch (e: any) {
            Alert.alert('Could not delete', e.message);
          }
        },
      },
    ]);
  };

  if (loading) return <Loading />;
  if (!issue) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <EmptyState icon="globe" title="Issue not found" body={error || 'It may have been taken down.'} />
      </View>
    );
  }

  const cover = safeUrl(issue.coverUrl);
  const period = periodLabel(issue);
  const nextPosition = articles.length ? Math.max(...articles.map((a) => a.position)) + 1 : 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ ...column(), padding: gutter, paddingBottom: space.xxl, gap: space.lg }}>
      <ErrorNote message={error} />
      <View style={{ gap: space.sm }}>
        {period ? (
          <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700', letterSpacing: 0.6 }}>{period.toUpperCase()}</Text>
        ) : null}
        <Text style={[typography.h2, { color: colors.text }]}>
          {issue.title}
          {issue.published ? '' : '  (draft)'}
        </Text>
        {issue.summary ? <Text style={[typography.body, { color: colors.textMuted }]}>{issue.summary}</Text> : null}
        {cover ? (
          <Image source={{ uri: cover }} style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: radius.md }} contentFit="cover" />
        ) : null}
        {editor ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            <Button
              label="Add article"
              icon="plus"
              small
              onPress={() => navigation.navigate('NewsEditor', { mode: 'article', issueId: issue.id, position: nextPosition })}
            />
            <Button label="Edit issue" icon="edit-2" small variant="secondary" onPress={() => navigation.navigate('NewsEditor', { mode: 'issue', issueId: issue.id })} />
            <Button label="Delete" icon="trash-2" small variant="secondary" onPress={confirmDelete} />
          </View>
        ) : null}
      </View>

      <View style={{ borderTopWidth: 1.5, borderTopColor: colors.border }}>
        {articles.length === 0 ? (
          <Text style={[typography.small, { color: colors.textFaint, paddingVertical: space.lg }]}>No articles in this issue yet.</Text>
        ) : (
          articles.map((a) => {
            const img = safeUrl(a.imageUrl);
            const src = safeUrl(a.sourceUrl);
            return (
              <Pressable
                key={a.id}
                onPress={() => navigation.navigate('Article', { articleId: a.id })}
                accessibilityRole="button"
                style={({ pressed }) => ({
                  paddingVertical: space.lg,
                  gap: space.sm,
                  borderBottomWidth: 1.5,
                  borderBottomColor: colors.border,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                {img ? <Image source={{ uri: img }} style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: radius.sm }} contentFit="cover" /> : null}
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>{a.title}</Text>
                {a.lead ? <Text style={[typography.small, { color: colors.textMuted }]}>{a.lead}</Text> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                  {src ? (
                    <Text onPress={() => Linking.openURL(src)} style={{ color: colors.primary, fontSize: 12 }}>
                      {a.sourceName || new URL(src).hostname} ↗
                    </Text>
                  ) : null}
                  {editor ? (
                    <Text
                      onPress={() => navigation.navigate('NewsEditor', { mode: 'article', issueId: issue.id, articleId: a.id })}
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

      <View style={{ flexDirection: 'row', gap: space.xl, alignItems: 'center' }}>
        <Pressable onPress={toggleLike} hitSlop={8} accessibilityRole="button" accessibilityLabel={liked ? 'Unlike' : 'Like'} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Feather name="heart" size={19} color={liked ? colors.primary : colors.textMuted} />
          <Text style={{ color: colors.textMuted }}>{issue.likesCount}</Text>
        </Pressable>
        <Pressable
          onPress={() => Share.share({ message: `${issue.title} - https://psekiewicz.github.io/issue?id=${issue.id}` })}
          hitSlop={8}
          accessibilityRole="button"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
        >
          <Feather name="share-2" size={18} color={colors.textMuted} />
          <Text style={{ color: colors.textMuted }}>Share</Text>
        </Pressable>
      </View>

      <CommentsSection
        projectId={issue.id}
        ownerId=""
        source={ISSUE_COMMENTS}
        canModerate={moderator}
        onSignIn={() => navigation.navigate('Login')}
        onAuthorPress={(userId) => navigation.navigate('UserProfile', { userId })}
      />
    </ScrollView>
  );
}
