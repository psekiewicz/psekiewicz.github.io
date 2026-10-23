import { Feather } from '@expo/vector-icons';
import MaskedView from '@react-native-masked-view/masked-view';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { Text, TextInput } from './Text';

import { frameFor, nameImage, nameStyle } from '../lib/cosmetics';
import { usePressScale } from '../lib/motion';
import { initials, timeAgo, typeMeta } from '../lib/utils';
import { useMotion } from '../theme/MotionProvider';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, typography } from '../theme/tokens';

// ---------------------------------------------------------------- text

export function Title({ children, style }: any) {
  const { colors } = useTheme();
  return <Text style={[typography.h1, { color: colors.text }, style]}>{children}</Text>;
}

export function Heading({ children, style }: any) {
  const { colors } = useTheme();
  return <Text style={[typography.h2, { color: colors.text }, style]}>{children}</Text>;
}

export function Body({ children, muted, style, numberOfLines }: any) {
  const { colors } = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[typography.body, { color: muted ? colors.textMuted : colors.text }, style]}
    >
      {children}
    </Text>
  );
}

// The small-caps micro-labels that do the work headings used to.
export function Eyebrow({ children, style }: any) {
  const { colors } = useTheme();
  return <Text style={[typography.eyebrow, { color: colors.accent }, style]}>{children}</Text>;
}

// ---------------------------------------------------------------- surfaces

export function Card({ children, style, onPress }: any) {
  const { colors } = useTheme();
  const { scale, onPressIn, onPressOut } = usePressScale(0.97);
  const body = (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          padding: 18,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <Animated.View style={{ transform: [{ scale }] }}>{body}</Animated.View>
    </Pressable>
  );
}

// ---------------------------------------------------------------- buttons

type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: any;
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
  style?: ViewStyle;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  small,
  style,
}: ButtonProps) {
  const { colors } = useTheme();
  const { scale, onPressIn, onPressOut } = usePressScale();

  const palette = {
    primary: { bg: colors.primary, fg: colors.onAccent, border: colors.primary },
    secondary: { bg: 'transparent', fg: colors.text, border: colors.borderStrong },
    ghost: { bg: 'transparent', fg: colors.textMuted, border: 'transparent' },
    danger: { bg: 'transparent', fg: colors.danger, border: colors.danger },
  }[variant];

  const inactive = disabled || loading;

  return (
    <Pressable
      onPress={inactive ? undefined : onPress}
      onPressIn={inactive ? undefined : onPressIn}
      onPressOut={inactive ? undefined : onPressOut}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive }}
      // The caller's style goes on the outer box, because what callers pass is
      // layout - flex, margins, alignSelf. On the inner box `flex: 1` measured
      // against the *column* the Pressable lays out, so the pill's content
      // collapsed to nothing: every row of two buttons (the editor's Draft and
      // Publish, the admin rows, a project's card) drew as empty pills.
      style={({ pressed }) => [
        {
          opacity: inactive ? 0.45 : pressed ? 0.75 : 1,
        },
        style,
      ]}
    >
      <Animated.View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space.sm,
          backgroundColor: palette.bg,
          borderColor: palette.border,
          borderWidth: 1.5,
          borderRadius: radius.pill,
          paddingVertical: small ? 10 : 14,
          // Room for a label in a button that shares a row: JetBrains Mono is
          // wider than the face this was drawn for.
          paddingHorizontal: small ? space.md : space.lg,
          transform: [{ scale }],
        }}
      >
        {loading ? (
          <ActivityIndicator size="small" color={palette.fg} />
        ) : (
          <>
            {icon ? <Feather name={icon} size={small ? 13 : 15} color={palette.fg} /> : null}
            <Text
              numberOfLines={1}
              style={{
                color: palette.fg,
                fontSize: small ? 12 : 14,
                fontWeight: '700',
                letterSpacing: 0.3,
                flexShrink: 1,
              }}
            >
              {label}
            </Text>
          </>
        )}
      </Animated.View>
    </Pressable>
  );
}

export function IconButton({ icon, onPress, color, size = 20, label }: any) {
  const { colors } = useTheme();
  const { scale, onPressIn, onPressOut } = usePressScale(0.85);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: space.xs })}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Feather name={icon} size={size} color={color || colors.textMuted} />
      </Animated.View>
    </Pressable>
  );
}

// ---------------------------------------------------------------- inputs

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  hint,
}: any) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: space.xs, marginBottom: space.lg }}>
      {label ? <Eyebrow>{label}</Eyebrow> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        multiline={multiline}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize || 'none'}
        autoCorrect={false}
        style={{
          color: colors.text,
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1.5,
          borderRadius: radius.sm,
          paddingHorizontal: space.lg,
          paddingVertical: 14,
          fontSize: 14,
          minHeight: multiline ? 110 : undefined,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
      {hint ? <Text style={[typography.small, { color: colors.textFaint }]}>{hint}</Text> : null}
    </View>
  );
}

export function Chip({ label, active, onPress, icon }: any) {
  const { colors } = useTheme();
  const { scale, onPressIn, onPressOut } = usePressScale();
  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <Animated.View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          paddingVertical: 9,
          paddingHorizontal: 15,
          borderRadius: radius.pill,
          borderWidth: active ? 0 : 1.5,
          borderColor: active ? 'transparent' : colors.border,
          backgroundColor: active ? colors.primarySoft : 'transparent',
          transform: [{ scale }],
        }}
      >
        {icon ? <Feather name={icon} size={12} color={active ? colors.primary : colors.textMuted} /> : null}
        <Text
          style={{
            fontSize: 12,
            fontWeight: '700',
            color: active ? colors.primary : colors.textMuted,
          }}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

// ---------------------------------------------------------------- identity

export function Avatar({ url, name, size = 40, ring }: any) {
  const { colors } = useTheme();
  const { enabled: motion } = useMotion();
  const frame = ring ? frameFor(ring) : null;

  const inner = url ? (
    <Image
      source={{ uri: url }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      contentFit="cover"
      transition={150}
    />
  ) : (
    <LinearGradient
      colors={[colors.primary, colors.accent]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.36 }}>
        {initials(name)}
      </Text>
    </LinearGradient>
  );

  if (!frame) return inner;

  // The frame is a transparent picture that sits around the avatar and
  // overhangs it - the same placement as .shop-border-* on the web, as
  // fractions of the avatar so one rule fits every size. It takes no layout
  // space and no touches.
  return (
    <View style={{ width: size, height: size }}>
      {inner}
      <Image
        pointerEvents="none"
        source={{ uri: frame.image }}
        style={{
          position: 'absolute',
          left: frame.box.left * size,
          top: frame.box.top * size,
          width: frame.box.width * size,
          height: frame.box.height * size,
        }}
        contentFit="fill"
        autoplay={motion}
      />
    </View>
  );
}

// Style keys that place the name in its row rather than draw its letters. A
// picture fill puts the text inside a MaskedView, so these move to that box.
const BOX_STYLE = /^(margin|flex|alignSelf|width|minWidth|maxWidth|position|top|left|right|bottom|zIndex)/;

// The display name, wearing whichever nickname effect the account has equipped.
//
// A picture effect is the picture seen through the letters, as on the web: an
// invisible copy of the text sizes the box, the picture is stretched over it
// and the same text, drawn opaque, masks it. The effect's solid colour sits
// under the picture so the name never blanks out while the image loads.
export function DisplayName({ name, effect, style, numberOfLines = 1 }: any) {
  const { colors } = useTheme();
  const { enabled: motion } = useMotion();
  const cosmetic = effect ? nameStyle(effect) : null;
  const picture = effect ? nameImage(effect) : null;
  const textStyle = [
    { color: colors.text, fontWeight: '700' as const, fontSize: 14 },
    style,
    cosmetic as TextStyle,
  ];

  if (!picture) {
    return (
      <Text numberOfLines={numberOfLines} style={textStyle}>
        {name}
      </Text>
    );
  }

  const box: Record<string, any> = {};
  const glyphs: Record<string, any> = {};
  for (const [key, value] of Object.entries(StyleSheet.flatten(textStyle) || {})) {
    // A text shadow would widen the mask into a smudge of picture.
    if (key.startsWith('textShadow')) continue;
    (BOX_STYLE.test(key) ? box : glyphs)[key] = value;
  }
  const label = (extra: TextStyle) => (
    <Text numberOfLines={numberOfLines} style={[glyphs, extra]}>
      {name}
    </Text>
  );

  return (
    <MaskedView style={box} maskElement={label({ color: '#000' })}>
      {label({ opacity: 0 })}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: cosmetic?.color || colors.text }]} />
      <Image
        source={{ uri: picture }}
        style={StyleSheet.absoluteFill}
        contentFit="fill"
        autoplay={motion}
      />
    </MaskedView>
  );
}

export function LevelChip({ level, small }: any) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: small ? 7 : 9,
        paddingVertical: small ? 2 : 4,
        borderRadius: radius.pill,
        backgroundColor: colors.text,
      }}
    >
      <Text
        style={{
          fontSize: small ? 9 : 10,
          fontWeight: '700',
          letterSpacing: 0.8,
          color: colors.bg,
        }}
      >
        LV {level}
      </Text>
    </View>
  );
}

export function TypeBadge({ type: projectType }: { type: string }) {
  const { colors } = useTheme();
  const meta = typeMeta(projectType);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Feather name={meta.icon} size={11} color={colors.textFaint} />
      <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: colors.textFaint }}>
        {meta.label.toUpperCase()}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------- states

export function Loading({ label }: { label?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ padding: space.xxl, alignItems: 'center', gap: space.md }}>
      <ActivityIndicator color={colors.primary} />
      {label ? <Text style={[typography.small, { color: colors.textFaint }]}>{label}</Text> : null}
    </View>
  );
}

export function EmptyState({ icon, title, body, action }: any) {
  const { colors } = useTheme();
  return (
    <View style={{ padding: space.xxl, alignItems: 'center', gap: space.md }}>
      <Feather name={icon || 'inbox'} size={30} color={colors.textFaint} />
      <Text style={[typography.h3, { color: colors.text, textAlign: 'center' }]}>{title}</Text>
      {body ? (
        <Text style={[typography.body, { color: colors.textMuted, textAlign: 'center' }]}>{body}</Text>
      ) : null}
      {action}
    </View>
  );
}

export function ErrorNote({ message }: { message: string }) {
  const { colors } = useTheme();
  if (!message) return null;
  return (
    <View
      style={{
        backgroundColor: colors.dangerSoft,
        borderColor: colors.danger,
        borderWidth: 1.5,
        borderRadius: radius.md,
        padding: space.lg,
        marginBottom: space.lg,
      }}
    >
      <Text style={[typography.small, { color: colors.danger }]}>{message}</Text>
    </View>
  );
}

export function SuccessNote({ message }: { message: string }) {
  const { colors } = useTheme();
  if (!message) return null;
  return (
    <View
      style={{
        backgroundColor: colors.successSoft,
        borderColor: colors.success,
        borderWidth: 1.5,
        borderRadius: radius.md,
        padding: space.lg,
        marginBottom: space.lg,
      }}
    >
      <Text style={[typography.small, { color: colors.success }]}>{message}</Text>
    </View>
  );
}

export { timeAgo };
