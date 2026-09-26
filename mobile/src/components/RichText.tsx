import React from 'react';
import { Linking, View } from 'react-native';

import { parseBlocks, parseInline } from '../lib/markdown';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

// A post body: the small Markdown slice from lib/markdown.ts drawn as
// native text - headings, bullet and numbered lists, paragraphs, and links
// that open in the browser. A plain text post comes out as paragraphs with
// its line breaks kept, the same as before.

const BODY = { fontSize: 14, lineHeight: 22 };

function Inline({ source }: { source: string }) {
  const { colors } = useTheme();
  return (
    <>
      {parseInline(source).map((tok, i) => {
        switch (tok.type) {
          case 'link':
            return (
              <Text
                key={i}
                accessibilityRole="link"
                onPress={() => Linking.openURL(tok.href!).catch(() => {})}
                style={{ color: colors.primary, textDecorationLine: 'underline' }}
              >
                {tok.text}
              </Text>
            );
          case 'code':
            return (
              <Text key={i} style={{ backgroundColor: colors.surfaceAlt }}>
                {tok.text}
              </Text>
            );
          case 'bold':
            return (
              <Text key={i} style={{ fontWeight: '700' }}>
                {tok.text}
              </Text>
            );
          case 'italic':
            return (
              <Text key={i} style={{ fontStyle: 'italic' }}>
                {tok.text}
              </Text>
            );
          default:
            return tok.text;
        }
      })}
    </>
  );
}

export function RichText({ source }: { source: string }) {
  const { colors } = useTheme();
  const blocks = parseBlocks(source);

  return (
    <View style={{ gap: 10 }}>
      {blocks.map((block, i) => {
        if (block.type === 'heading') {
          return (
            <Text
              key={i}
              accessibilityRole="header"
              style={{
                fontSize: block.level === 1 ? 17 : block.level === 2 ? 15.5 : 14.5,
                lineHeight: 22,
                fontWeight: '800',
                color: block.level === 3 ? colors.textMuted : colors.text,
                marginTop: i === 0 ? 0 : 10,
                paddingBottom: block.level === 3 ? 0 : 5,
                borderBottomWidth: block.level === 3 ? 0 : 1,
                borderBottomColor: colors.border,
              }}
            >
              <Inline source={block.text} />
            </Text>
          );
        }
        if (block.type === 'list') {
          return (
            <View key={i} style={{ gap: 8 }}>
              {block.items.map((item, j) => (
                <View key={j} style={{ flexDirection: 'row', gap: 8 }}>
                  <Text style={[BODY, { color: colors.primary, minWidth: block.ordered ? 20 : 10 }]}>
                    {block.ordered ? `${j + 1}.` : '•'}
                  </Text>
                  <Text style={[BODY, { flex: 1, color: colors.text }]}>
                    <Inline source={item} />
                  </Text>
                </View>
              ))}
            </View>
          );
        }
        return (
          <Text key={i} style={[BODY, { color: colors.text }]}>
            {block.lines.map((line, j) => (
              <React.Fragment key={j}>
                {j > 0 ? '\n' : null}
                <Inline source={line} />
              </React.Fragment>
            ))}
          </Text>
        );
      })}
    </View>
  );
}
