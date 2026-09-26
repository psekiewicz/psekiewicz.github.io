import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import React, { useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Edit, insertImage, insertLink, toggleHeading, toggleList, wrap } from '../lib/formatEdit';
import { safeUrl } from '../lib/utils';
import { Colors, radius, space } from '../theme/tokens';
import { RichText } from './RichText';
import { Text, TextInput } from './Text';
import { Button } from './ui';

// The description box with a formatting bar: buttons that write the Markdown
// lib/markdown.ts reads, a Write/Preview switch, and a small panel for links
// and pictures (prefilled from the clipboard when it holds a link), since
// Android has no prompt dialog to ask for one.

type Tool = { key: string; icon: keyof typeof Feather.glyphMap; label: string };

// Most used first: the row scrolls on a narrow phone, and pictures and links
// are the ones nobody would think to scroll for.
const TOOLS: Tool[] = [
  { key: 'heading', icon: 'type', label: 'Heading' },
  { key: 'bold', icon: 'bold', label: 'Bold' },
  { key: 'image', icon: 'image', label: 'Picture from a link' },
  { key: 'link', icon: 'link', label: 'Link' },
  { key: 'bullets', icon: 'list', label: 'Bulleted list' },
  { key: 'numbers', icon: 'hash', label: 'Numbered list' },
  { key: 'italic', icon: 'italic', label: 'Italic' },
  { key: 'code', icon: 'code', label: 'Code' },
];

type Panel = { kind: 'link' | 'image'; url: string; text: string } | null;

export function FormatEditor({
  value,
  onChangeText,
  placeholder,
  colors,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  colors: Colors;
}) {
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const [panel, setPanel] = useState<Panel>(null);
  // Where the caret was last. A tap on the bar blurs the input on some
  // keyboards, so this is read from here rather than from the input.
  const selection = useRef({ start: value.length, end: value.length });
  // Set only right after an edit, to move the caret; cleared on the next
  // selection change so typing isn't fighting a controlled prop.
  const [forced, setForced] = useState<{ start: number; end: number } | undefined>();

  const apply = (edit: Edit) => {
    onChangeText(edit.value);
    selection.current = { start: edit.start, end: edit.end };
    setForced({ start: edit.start, end: edit.end });
  };

  const openPanel = async (kind: 'link' | 'image') => {
    const clip = (await Clipboard.getStringAsync().catch(() => '')).trim();
    const { start, end } = selection.current;
    setPanel({
      kind,
      url: /^https?:\/\/\S+$/.test(clip) ? clip : '',
      text: kind === 'link' ? value.slice(start, end) : '',
    });
  };

  const run = (key: string) => {
    const { start, end } = selection.current;
    switch (key) {
      case 'bold':
      case 'italic':
      case 'code':
        return apply(wrap(value, start, end, key));
      case 'heading':
        return apply(toggleHeading(value, start, end));
      case 'bullets':
        return apply(toggleList(value, start, end, false));
      case 'numbers':
        return apply(toggleList(value, start, end, true));
      case 'link':
      case 'image':
        return openPanel(key);
      default:
        return undefined;
    }
  };

  const panelUrl = panel ? safeUrl(panel.url.trim()) : '';
  const insert = () => {
    if (!panel || !panelUrl) return;
    const { start, end } = selection.current;
    if (panel.kind === 'image') {
      apply(insertImage(value, start, end, panelUrl, panel.text));
    } else {
      // The typed text replaces whatever was selected.
      const text = panel.text.trim();
      const base = text ? value.slice(0, start) + text + value.slice(end) : value;
      apply(insertLink(base, start, text ? start + text.length : end, panelUrl));
    }
    setPanel(null);
  };

  const field = {
    fontSize: 13,
    color: colors.text,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.bg,
  };

  return (
    <View style={{ gap: space.sm }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          borderRadius: radius.sm,
          backgroundColor: colors.surface,
          padding: 3,
        }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          style={{ flex: 1, opacity: mode === 'preview' ? 0.35 : 1 }}
          contentContainerStyle={{ gap: 2 }}
        >
          {TOOLS.map((tool) => (
            <Pressable
              key={tool.key}
              disabled={mode === 'preview'}
              onPress={() => run(tool.key)}
              accessibilityRole="button"
              accessibilityLabel={tool.label}
              hitSlop={4}
              style={({ pressed }) => ({
                width: 36,
                height: 34,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 6,
                backgroundColor: pressed ? colors.bg : 'transparent',
              })}
            >
              <Feather name={tool.icon} size={16} color={colors.text} />
            </Pressable>
          ))}
        </ScrollView>
        <View style={{ flexDirection: 'row', borderRadius: 8, backgroundColor: colors.bg, padding: 2 }}>
          {(['write', 'preview'] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => {
                setPanel(null);
                setMode(m);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === m }}
              style={{
                paddingHorizontal: 9,
                paddingVertical: 5,
                borderRadius: 6,
                backgroundColor: mode === m ? colors.surface : 'transparent',
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: mode === m ? '700' : '400',
                  color: mode === m ? colors.text : colors.textMuted,
                }}
              >
                {m === 'write' ? 'Write' : 'Preview'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {panel ? (
        <View
          style={{
            gap: space.sm,
            padding: space.md,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.borderStrong,
            backgroundColor: colors.surface,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>
            {panel.kind === 'image' ? 'Picture from a link' : 'Add a link'}
          </Text>
          <TextInput
            value={panel.url}
            onChangeText={(url) => setPanel({ ...panel, url })}
            placeholder={panel.kind === 'image' ? 'https://… (address of the image)' : 'https://…'}
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            autoFocus={!panel.url}
            style={field}
          />
          <TextInput
            value={panel.text}
            onChangeText={(text) => setPanel({ ...panel, text })}
            placeholder={panel.kind === 'image' ? 'Caption (optional)' : 'Text to show (optional)'}
            placeholderTextColor={colors.textFaint}
            style={field}
          />
          {panel.url.trim() && !panelUrl ? (
            <Text style={{ fontSize: 11, color: colors.danger }}>That needs to be a full http(s):// link.</Text>
          ) : null}
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button label="Insert" small disabled={!panelUrl} onPress={insert} />
            <Button label="Cancel" small variant="ghost" onPress={() => setPanel(null)} />
          </View>
        </View>
      ) : null}

      {mode === 'preview' ? (
        <View style={{ minHeight: 92, paddingVertical: 6 }}>
          {value.trim() ? (
            <RichText source={value} />
          ) : (
            <Text style={{ fontSize: 14, color: colors.textFaint }}>Nothing to preview yet.</Text>
          )}
        </View>
      ) : (
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          multiline
          maxLength={20000}
          autoCapitalize="sentences"
          autoCorrect
          selection={forced}
          onSelectionChange={(e) => {
            selection.current = e.nativeEvent.selection;
            if (forced) setForced(undefined);
          }}
          style={{
            fontSize: 14,
            lineHeight: 22,
            color: colors.textMuted,
            paddingVertical: 6,
            minHeight: 140,
            textAlignVertical: 'top',
          }}
        />
      )}
    </View>
  );
}
