import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
  ActivityIndicator,
  Animated,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';

import { borderStyle, nameStyle } from '../lib/cosmetics';
import { usePressScale } from '../lib/motion';
import { initials, timeAgo, typeMeta } from '../lib/utils';
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
  return <Text style={[typography.eyebrow, { color: colors.textFaint }, style]}>{children}</Text>;
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
          borderColor: colors.border,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderRadius: radius.md,
          padding: space.lg,
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

export function Divider({ style }: any) {
  const { colors } = useTheme();
  return <View style={[{ height: StyleSheet.hairlineWidth * 2, backgroundColor: colors.border }, style]} />;
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
    primary: { bg: colors.primary, fg: '#fff', border: colors.primary },
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
      style={({ pressed }) => [
        {
          opacity: inactive ? 0.45 : pressed ? 0.75 : 1,
        },
      ]}
    >
      <Animated.View
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: space.sm,
            backgroundColor: palette.bg,
            borderColor: palette.border,
            borderWidth: StyleSheet.hairlineWidth * 2,
            borderRadius: radius.sm,
            paddingVertical: small ? space.sm : space.md,
            paddingHorizontal: small ? space.md : space.lg,
            transform: [{ scale }],
          },
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={palette.fg} />
        ) : (
          <>
            {icon ? <Feather name={icon} size={small ? 13 : 15} color={palette.fg} /> : null}
            <Text
              style={{
                color: palette.fg,
                fontSize: small ? 12 : 14,
                fontWeight: '700',
                letterSpacing: 0.3,
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
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderRadius: radius.sm,
          paddingHorizontal: space.md,
          paddingVertical: space.md,
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
          paddingVertical: 6,
          paddingHorizontal: space.md,
          borderRadius: radius.sm,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: active ? colors.primary : colors.border,
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
  const cosmetic = ring ? borderStyle(ring) : null;
  const ringWidth = cosmetic ? cosmetic.width : 0;

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

  if (!cosmetic) return inner;

  const ring_ = { padding: ringWidth, borderRadius: (size + ringWidth * 2) / 2 };

  // border-flame is a texture PNG on the web (.shop-border-flame::after),
  // not a colour - painting it as a flat blue ring threw the actual art
  // away. Stretched to the ring's exact box the same way the web's
  // `100% 100%` background-size does, since the PNG already has the
  // transparent centre baked in.
  if (cosmetic.image) {
    return (
      <ImageBackground
        source={{ uri: cosmetic.image }}
        style={ring_}
        imageStyle={{ borderRadius: ring_.borderRadius }}
        resizeMode="stretch"
      >
        {inner}
      </ImageBackground>
    );
  }

  // Two borders - rainbow and conic - are defined as gradients. Painting them
  // with the flat `color` threw that away, which made the two showiest things
  // in the shop the two that looked like nothing in particular.
  if (cosmetic.gradient) {
    return (
      <LinearGradient
        colors={cosmetic.gradient as any}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={ring_}
      >
        {inner}
      </LinearGradient>
    );
  }

  return <View style={[ring_, { backgroundColor: cosmetic.color }]}>{inner}</View>;
}

// The display name, wearing whichever nickname effect the account has equipped.
export function DisplayName({ name, effect, style, numberOfLines = 1 }: any) {
  const { colors } = useTheme();
  const cosmetic = effect ? nameStyle(effect) : null;
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[{ color: colors.text, fontWeight: '700', fontSize: 14 }, style, cosmetic as TextStyle]}
    >
      {name}
    </Text>
  );
}

export function LevelChip({ level, small }: any) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: small ? 5 : 7,
        paddingVertical: small ? 1 : 2,
        borderRadius: radius.sm,
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderColor: colors.borderStrong,
        backgroundColor: colors.mutedSoft,
      }}
    >
      <Text style={{ fontSize: small ? 9 : 11, fontWeight: '700', color: colors.textMuted }}>
        Lv {level}
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
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderRadius: radius.sm,
        padding: space.md,
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
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderRadius: radius.sm,
        padding: space.md,
        marginBottom: space.lg,
      }}
    >
      <Text style={[typography.small, { color: colors.success }]}>{message}</Text>
    </View>
  );
}

export function Stat({ label, value }: { label: string; value: string | number }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', flex: 1, gap: 2 }}>
      <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>{value}</Text>
      <Text style={[typography.eyebrow, { color: colors.textFaint }]}>{label}</Text>
    </View>
  );
}

export function ProgressBar({ progress }: { progress: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        height: 6,
        borderRadius: 999,
        backgroundColor: colors.mutedSoft,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: `${Math.max(0, Math.min(1, progress)) * 100}%`,
          height: '100%',
          backgroundColor: colors.primary,
        }}
      />
    </View>
  );
}

export { timeAgo };
