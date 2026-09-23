import React from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '../components/Text';
import { TopBar, TopBarButton } from '../components/TopBar';
import { column } from '../lib/layout';
import { LEGAL_UPDATED, legalDocument, LegalDocument } from '../legal/documents';
import { useTheme } from '../theme/ThemeProvider';
import { space, typography } from '../theme/tokens';

// One screen for all three documents - terms, privacy and the guidelines are
// the same shape, so they are drawn by the same code and differ only in the
// `doc` param. Prose, so it takes the reading column rather than the width of
// whatever window it is given.

export function LegalScreen({ route, navigation }: any) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const doc: LegalDocument = legalDocument(route?.params?.doc ?? 'terms');

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar
        leading={<TopBarButton icon="back" label="Back" onPress={() => navigation.goBack()} />}
        title={doc.title}
      />

      <ScrollView
        contentContainerStyle={{
          ...column(),
          paddingHorizontal: space.lg,
          paddingTop: space.lg,
          paddingBottom: space.xxl + insets.bottom,
          gap: space.lg,
        }}
      >
        <View style={{ gap: 6 }}>
          <Text style={[typography.body, { color: colors.textMuted }]}>{doc.summary}</Text>
          <Text style={[typography.small, { color: colors.textFaint }]}>
            Last updated {LEGAL_UPDATED}
          </Text>
        </View>

        {doc.sections.map((section) => (
          <View key={section.heading} style={{ gap: 8 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>
              {section.heading}
            </Text>
            {section.body.map((paragraph, i) => {
              const bullet = paragraph.startsWith('- ');
              return (
                <View
                  key={i}
                  style={{ flexDirection: 'row', gap: 8, paddingLeft: bullet ? 2 : 0 }}
                >
                  {bullet ? (
                    <Text style={{ fontSize: 14, lineHeight: 21, color: colors.textFaint }}>
                      {'•'}
                    </Text>
                  ) : null}
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 14,
                      lineHeight: 21,
                      color: colors.textMuted,
                    }}
                  >
                    {bullet ? paragraph.slice(2) : paragraph}
                  </Text>
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
