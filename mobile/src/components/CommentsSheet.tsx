import { Feather } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../context/AuthContext';
import { displayNameOf } from '../data/auth';
import { addComment, Comment, deleteComment, getComments } from '../data/comments';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, typography } from '../theme/tokens';
import { timeAgo } from '../lib/utils';
import { Avatar, EmptyState } from './ui';

type Props = {
  projectId: string | null;
  visible: boolean;
  onClose: () => void;
  // The parent keeps the count on the card, so it needs telling when the
  // number changes here rather than refetching the whole feed.
  onCountChange?: (projectId: string, delta: number) => void;
  // Set when the viewer owns the project: the owner can delete any comment on
  // it, same as the RLS policy allows.
  ownerId?: string;
};

export function CommentsSheet({ projectId, visible, onClose, onCountChange, ownerId }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();

  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!visible || !projectId) return;
    setLoading(true);
    getComments(projectId)
      .then(setComments)
      .catch(() => setComments([]))
      .finally(() => setLoading(false));
  }, [visible, projectId]);

  const submit = async () => {
    if (!user || !projectId || !body.trim()) return;
    setSending(true);
    try {
      const name = profile?.displayName || displayNameOf(user);
      const created = await addComment(projectId, user.id, name, body.trim());
      setComments((prev) => [...prev, created]);
      setBody('');
      onCountChange?.(projectId, 1);
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
      if (projectId) onCountChange?.(projectId, -1);
    } catch {
      // RLS refused it - nothing to undo locally.
    }
  };

  const canDelete = (comment: Comment) =>
    !!user && (comment.userId === user.id || ownerId === user.id);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={onClose} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{
          height: '72%',
          backgroundColor: colors.bg,
          borderTopLeftRadius: radius.lg,
          borderTopRightRadius: radius.lg,
          borderTopWidth: StyleSheet.hairlineWidth * 2,
          borderColor: colors.border,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            padding: space.lg,
            borderBottomWidth: StyleSheet.hairlineWidth * 2,
            borderBottomColor: colors.border,
          }}
        >
          <Text style={[typography.h3, { color: colors.text, flex: 1 }]}>
            Comments{comments.length ? ` · ${comments.length}` : ''}
          </Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Feather name="x" size={20} color={colors.textMuted} />
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: space.xxl }} color={colors.primary} />
        ) : (
          <FlatList
            data={comments}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: space.lg, gap: space.lg }}
            ListEmptyComponent={
              <EmptyState icon="message-circle" title="No comments yet" body="Be the first." />
            }
            renderItem={({ item }) => (
              <View style={{ flexDirection: 'row', gap: space.md }}>
                <Avatar name={item.authorName} size={28} />
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <Text style={{ color: colors.text, fontWeight: '700', fontSize: 12 }}>
                      {item.authorName}
                    </Text>
                    <Text style={{ color: colors.textFaint, fontSize: 10 }}>
                      {timeAgo(item.createdAt)}
                    </Text>
                    <View style={{ flex: 1 }} />
                    {canDelete(item) ? (
                      <Pressable onPress={() => remove(item)} hitSlop={8}>
                        <Feather name="trash-2" size={13} color={colors.textFaint} />
                      </Pressable>
                    ) : null}
                  </View>
                  <Text style={[typography.body, { color: colors.textMuted }]}>{item.body}</Text>
                </View>
              </View>
            )}
          />
        )}

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.sm,
            padding: space.lg,
            paddingBottom: space.lg + insets.bottom,
            borderTopWidth: StyleSheet.hairlineWidth * 2,
            borderTopColor: colors.border,
          }}
        >
          {user ? (
            <>
              <TextInput
                value={body}
                onChangeText={setBody}
                placeholder="Add a comment"
                placeholderTextColor={colors.textFaint}
                multiline
                style={{
                  flex: 1,
                  maxHeight: 96,
                  color: colors.text,
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderWidth: StyleSheet.hairlineWidth * 2,
                  borderRadius: radius.sm,
                  paddingHorizontal: space.md,
                  paddingVertical: space.sm,
                  fontSize: 14,
                }}
              />
              <Pressable onPress={submit} disabled={sending || !body.trim()} hitSlop={8}>
                <Feather
                  name="send"
                  size={20}
                  color={body.trim() ? colors.primary : colors.textFaint}
                />
              </Pressable>
            </>
          ) : (
            <Text style={[typography.small, { color: colors.textMuted, textAlign: 'center', flex: 1 }]}>
              Sign in to join the conversation.
            </Text>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
