import { Feather } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { displayNameOf } from '../data/auth';
import { addComment, Comment, deleteComment, getComments } from '../data/comments';
import { getProfilesByIds, Profile } from '../data/profiles';
import { timeAgo } from '../lib/utils';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, typography } from '../theme/tokens';
import { Text, TextInput } from './Text';
import { Avatar } from './ui';

// The conversation under a post, in the page rather than in a sheet - the way
// the website's post page has it: a box to write in, then the comments. The
// data handling is the same as CommentsSheet's, which Scrolls still uses.

type Props = {
  projectId: string;
  // The owner can delete any comment on their own post, as RLS allows.
  ownerId: string;
  onCountChange?: (delta: number) => void;
  onSignIn: () => void;
  onAuthorPress: (userId: string) => void;
};

export function CommentsSection({ projectId, ownerId, onCountChange, onSignIn, onAuthorPress }: Props) {
  const { colors } = useTheme();
  const { user, profile } = useAuth();

  const [comments, setComments] = useState<Comment[]>([]);
  const [authors, setAuthors] = useState<Map<string, Profile>>(new Map());
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setLoading(true);
    getComments(projectId)
      .then(async (rows) => {
        setComments(rows);
        setAuthors(await getProfilesByIds(rows.map((c) => c.userId)).catch(() => new Map<string, Profile>()));
      })
      .catch(() => setComments([]))
      .finally(() => setLoading(false));
  }, [projectId]);

  const submit = async () => {
    if (!user || !body.trim()) return;
    setSending(true);
    try {
      const name = profile?.displayName || displayNameOf(user);
      const created = await addComment(projectId, user.id, name, body.trim());
      setComments((prev) => [...prev, created]);
      setBody('');
      onCountChange?.(1);
    } catch {
      // Left in the box so the text isn't lost.
    } finally {
      setSending(false);
    }
  };

  const remove = async (comment: Comment) => {
    try {
      await deleteComment(comment.id);
      setComments((prev) => prev.filter((c) => c.id !== comment.id));
      onCountChange?.(-1);
    } catch {
      // RLS refused it - nothing to undo locally.
    }
  };

  const avatarOf = (comment: Comment) =>
    authors.get(comment.userId)?.avatarUrl || (comment.userId === user?.id ? profile?.avatarUrl : undefined);

  const box = {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: colors.border,
    borderRadius: radius.lg,
  };

  return (
    <View style={{ gap: space.md }}>
      <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>
        Comments{comments.length ? ` · ${comments.length}` : ''}
      </Text>

      {user ? (
        <View style={[box, { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, padding: space.sm, paddingLeft: space.md }]}>
          <Avatar url={profile?.avatarUrl} name={profile?.displayName || displayNameOf(user)} size={30} />
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Add a comment"
            placeholderTextColor={colors.textFaint}
            multiline
            maxLength={2000}
            style={{ flex: 1, maxHeight: 120, color: colors.text, fontSize: 14, paddingVertical: 8 }}
          />
          <Pressable
            onPress={submit}
            disabled={sending || !body.trim()}
            accessibilityRole="button"
            accessibilityLabel="Post comment"
            style={{
              width: 38,
              height: 38,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: body.trim() ? colors.primary : colors.surfaceAlt,
            }}
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.onAccent} />
            ) : (
              <Feather name="send" size={16} color={body.trim() ? colors.onAccent : colors.textFaint} />
            )}
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={onSignIn} accessibilityRole="link" style={[box, { padding: space.md }]}>
          <Text style={[typography.small, { color: colors.textMuted, textAlign: 'center' }]}>
            <Text style={{ color: colors.primary, fontWeight: '700' }}>Sign in</Text> to join the conversation.
          </Text>
        </Pressable>
      )}

      {loading ? (
        <ActivityIndicator style={{ marginVertical: space.lg }} color={colors.primary} />
      ) : comments.length === 0 ? (
        <Text style={[typography.small, { color: colors.textFaint, textAlign: 'center', paddingVertical: space.md }]}>
          No comments yet - be the first to say something.
        </Text>
      ) : (
        <View style={[box, { overflow: 'hidden' }]}>
          {comments.map((c, i) => {
            const canDelete = !!user && (c.userId === user.id || ownerId === user.id);
            return (
              <View
                key={c.id}
                style={{
                  flexDirection: 'row',
                  gap: space.md,
                  padding: space.md,
                  borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth * 2,
                  borderTopColor: colors.border,
                }}
              >
                <Pressable onPress={() => onAuthorPress(c.userId)} hitSlop={4}>
                  <Avatar url={avatarOf(c)} name={c.authorName} size={32} />
                </Pressable>
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <Text
                      onPress={() => onAuthorPress(c.userId)}
                      style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}
                      numberOfLines={1}
                    >
                      {c.authorName}
                    </Text>
                    <Text style={{ color: colors.textFaint, fontSize: 11 }}>{timeAgo(c.createdAt)}</Text>
                    <View style={{ flex: 1 }} />
                    {canDelete ? (
                      <Pressable onPress={() => remove(c)} hitSlop={8} accessibilityLabel="Delete comment">
                        <Feather name="trash-2" size={14} color={colors.textFaint} />
                      </Pressable>
                    ) : null}
                  </View>
                  <Text style={[typography.body, { color: colors.text }]}>{c.body}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
