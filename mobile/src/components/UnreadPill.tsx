import React from 'react';
import { View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

// The "New" mark on news a reader hasn't opened yet - the site's .news-unread.
export function UnreadPill({ label = 'New' }: { label?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 1, borderRadius: 999, backgroundColor: colors.primary }}>
      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.4 }}>{label.toUpperCase()}</Text>
    </View>
  );
}
