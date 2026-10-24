import { Feather } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '../../components/Text';
import { Eyebrow } from '../../components/ui';
import { useTheme } from '../../theme/ThemeProvider';
import { space, typography } from '../../theme/tokens';
import { anythingNew } from './checks';

// The way into the update screen from Settings, with a dot when there's
// something to install. Checks quietly once per visit to Settings.
export function UpdateSettingsLink({ navigation }: any) {
  const { colors } = useTheme();
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let live = true;
    anythingNew().then((v) => live && setAvailable(v));
    return () => {
      live = false;
    };
  }, []);

  return (
    <View>
      <Eyebrow>Updates</Eyebrow>
      <Pressable
        onPress={() => navigation.navigate('AppUpdate')}
        accessibilityRole="button"
        accessibilityLabel={available ? 'App updates, an update is available' : 'App updates'}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md, opacity: pressed ? 0.7 : 1 })}
      >
        <Text style={[typography.body, { color: colors.primary, flex: 1 }]}>App updates</Text>
        {available ? (
          <View style={{ paddingHorizontal: 8, paddingVertical: 1, borderRadius: 999, backgroundColor: colors.primary }}>
            <Text style={{ color: colors.onAccent, fontSize: 10, fontWeight: '800', letterSpacing: 0.4 }}>UPDATE</Text>
          </View>
        ) : null}
        <Feather name="chevron-right" size={18} color={colors.textFaint} />
      </Pressable>
    </View>
  );
}
