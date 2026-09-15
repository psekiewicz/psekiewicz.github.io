import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { radius } from '../theme/tokens';
import { Text } from './Text';

// Underlined text tabs - the website's For you / Following / Latest row and its
// profile's Posts / Achievements row.
export function FeedTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        borderBottomWidth: StyleSheet.hairlineWidth * 2,
        borderBottomColor: colors.border,
      }}
    >
      {tabs.map((tab) => {
        const selected = tab.value === value;
        return (
          <Pressable
            key={tab.value}
            onPress={() => onChange(tab.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={({ pressed }) => ({
              flex: 1,
              alignItems: 'center',
              paddingTop: 13,
              paddingBottom: 12,
              backgroundColor: pressed ? colors.surfaceAlt : 'transparent',
            })}
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: selected ? colors.text : colors.textFaint }}>
              {tab.label}
            </Text>
            <View
              style={{
                position: 'absolute',
                bottom: 0,
                width: 48,
                height: 4,
                borderRadius: radius.pill,
                backgroundColor: selected ? colors.primary : 'transparent',
              }}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
