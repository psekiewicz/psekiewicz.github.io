import { Feather } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text, TextInput } from './Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../context/AuthContext';
import { REPORT_REASONS, reportProject } from '../data/reports';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, typography } from '../theme/tokens';
import { Body, Button, ErrorNote } from './ui';

type Props = {
  projectId: string;
  visible: boolean;
  onClose: () => void;
};

// The site's report modal, as a sheet: one reason, an optional note, send.
// It lands in the same `reports` table and the same admin queue.
export function ReportSheet({ projectId, visible, onClose }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [reason, setReason] = useState(REPORT_REASONS[0].id);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<'filed' | 'duplicate' | null>(null);

  // Each opening starts from a blank report rather than the last one's state.
  useEffect(() => {
    if (!visible) return;
    setReason(REPORT_REASONS[0].id);
    setNote('');
    setError('');
    setResult(null);
  }, [visible]);

  const send = async () => {
    if (!user) return;
    setSending(true);
    setError('');
    try {
      const filed = await reportProject(projectId, user.id, reason, note);
      setResult(filed ? 'filed' : 'duplicate');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={onClose} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{
          maxHeight: '85%',
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
          <Text style={[typography.h3, { color: colors.text, flex: 1 }]}>Report entry</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
            <Feather name="x" size={20} color={colors.textMuted} />
          </Pressable>
        </View>

        {result ? (
          <View style={{ padding: space.lg, paddingBottom: space.lg + insets.bottom, gap: space.lg }}>
            <Body>
              {result === 'filed'
                ? 'Thanks - an admin will take a look.'
                : 'You already reported this one. An admin will take a look.'}
            </Body>
            <Button label="Done" onPress={onClose} />
          </View>
        ) : (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: space.lg, paddingBottom: space.lg + insets.bottom, gap: space.sm }}
          >
            <ErrorNote message={error} />
            <Text style={[typography.small, { color: colors.textMuted, marginBottom: space.xs }]}>
              What's wrong with it?
            </Text>
            {REPORT_REASONS.map((r) => {
              const selected = r.id === reason;
              return (
                <Pressable
                  key={r.id}
                  onPress={() => setReason(r.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.md,
                    paddingVertical: space.md,
                    paddingHorizontal: space.md,
                    borderRadius: radius.sm,
                    borderWidth: 1.5,
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: selected ? colors.primarySoft : colors.surface,
                  }}
                >
                  <View
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: radius.pill,
                      borderWidth: 2,
                      borderColor: selected ? colors.primary : colors.textFaint,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {selected ? (
                      <View
                        style={{ width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.primary }}
                      />
                    ) : null}
                  </View>
                  <Text style={[typography.body, { color: colors.text, flex: 1 }]}>{r.label}</Text>
                </Pressable>
              );
            })}

            <Text style={[typography.small, { color: colors.textMuted, marginTop: space.md }]}>
              Anything to add? (optional)
            </Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              maxLength={500}
              multiline
              placeholder="What an admin should know"
              placeholderTextColor={colors.textFaint}
              style={{
                minHeight: 80,
                color: colors.text,
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderWidth: 1.5,
                borderRadius: radius.sm,
                padding: space.md,
                fontSize: 14,
                textAlignVertical: 'top',
              }}
            />

            <Button label="Send report" onPress={send} loading={sending} style={{ marginTop: space.md }} />
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}
