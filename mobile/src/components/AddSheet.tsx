import React, { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMotion } from '../theme/MotionProvider';
import { useTheme } from '../theme/ThemeProvider';
import { gutter, radius, typography } from '../theme/tokens';
import { Icon, IconName } from './icons';

// "What are you adding?" - the sheet the add button opens. Four tinted tiles,
// each seeding the editor with a type so the form opens already knowing what
// kind of entry this is.

type Choice = { label: string; type: string; icon: IconName; tone: 'primary' | 'accent' | 'sand' | 'plain' };

const CHOICES: Choice[] = [
  { label: 'Music', type: 'music', icon: 'music', tone: 'primary' },
  { label: 'Video', type: 'video', icon: 'scrolls', tone: 'accent' },
  { label: 'Image', type: 'image', icon: 'image', tone: 'sand' },
  { label: 'Paste link', type: 'other', icon: 'external', tone: 'plain' },
];

export function AddSheet({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (projectType: string) => void;
}) {
  const { colors } = useTheme();
  const { enabled } = useMotion();
  const insets = useSafeAreaInsets();

  const rise = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    if (!visible) return;
    if (!enabled) {
      rise.setValue(1);
      return;
    }
    rise.setValue(0);
    Animated.spring(rise, { toValue: 1, useNativeDriver: true, speed: 13, bounciness: 5 }).start();
  }, [visible, enabled, rise]);

  const tones = {
    primary: { bg: colors.primarySoft, fg: colors.primaryDeep },
    accent: { bg: colors.accentSoft, fg: colors.accentDeep },
    sand: { bg: colors.mutedSoft, fg: colors.textMuted },
    plain: { bg: colors.surface, fg: colors.textMuted },
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: colors.scrim }} onPress={onClose}>
        {/* Swallows taps so a press inside the sheet doesn't close it. */}
        <Pressable
          onPress={() => {}}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
        >
          <Animated.View
            style={{
              backgroundColor: colors.bg,
              borderRadius: radius.xl,
              paddingHorizontal: gutter,
              paddingTop: 26,
              paddingBottom: 30 + insets.bottom,
              gap: 12,
              transform: [
                { translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [26, 0] }) },
              ],
              opacity: rise,
            }}
          >
            <View
              style={{
                width: 44,
                height: 5,
                borderRadius: radius.pill,
                backgroundColor: colors.border,
                alignSelf: 'center',
              }}
            />
            <Text style={[typography.h3, { color: colors.text }]}>What are you adding?</Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {CHOICES.map((c) => {
                const tone = tones[c.tone];
                return (
                  <Pressable
                    key={c.type}
                    onPress={() => onPick(c.type)}
                    accessibilityRole="button"
                    style={({ pressed }) => ({
                      // Two to a row, with the 12px gap taken out of the width.
                      width: '47.5%',
                      flexGrow: 1,
                      backgroundColor: tone.bg,
                      borderRadius: radius.md,
                      padding: 18,
                      gap: 10,
                      opacity: pressed ? 0.75 : 1,
                    })}
                  >
                    <Icon name={c.icon} size={24} color={tone.fg} />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>
                      {c.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
