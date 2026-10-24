import React, { useCallback, useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { AppState, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Announcement, Attachment, getActiveAnnouncement, markSeen, wasSeen } from '../data/announcements';
import { openLink } from '../lib/links';
import { safeUrl } from '../lib/utils';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, typography } from '../theme/tokens';
import { RichText } from './RichText';
import { Text } from './Text';
import { Button } from './ui';

// A film, or - with `audio` - a sound shown as a slim controls-only bar.
function Film({ url, audio }: { url: string; audio?: boolean }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
  });
  return (
    <VideoView
      player={player}
      style={{
        width: '100%',
        height: audio ? 64 : undefined,
        aspectRatio: audio ? undefined : 16 / 9,
        borderRadius: radius.md,
        backgroundColor: audio ? '#e9e8e4' : '#000',
      }}
      contentFit="contain"
      nativeControls
    />
  );
}

// One attached file: pictures, films and sound in place, anything else as a link.
function AttachmentView({ file }: { file: Attachment }) {
  const { colors } = useTheme();
  const url = safeUrl(file.url);
  if (!url) return null;
  const type = String(file.type || '');
  if (type.startsWith('image/')) {
    return (
      <Image
        source={{ uri: url }}
        style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: radius.md }}
        contentFit="cover"
      />
    );
  }
  if (type.startsWith('video/')) return <Film url={url} />;
  if (type.startsWith('audio/')) return <Film url={url} audio />;
  return (
    <Pressable
      onPress={() => openLink(url)}
      accessibilityRole="link"
      style={{
        padding: space.md,
        borderRadius: radius.md,
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderColor: colors.border,
        backgroundColor: colors.surface,
      }}
    >
      <Text style={{ color: colors.primary, textDecorationLine: 'underline' }}>{file.name || 'Download'}</Text>
    </Pressable>
  );
}

// The admin's message, as a centred popup. It is shown once per announcement on
// a device: dismissing it records the id, and a newer announcement shows again.
// Checked at mount and whenever the app comes back to the foreground, so a
// notice published while someone has the app open reaches them on return.
export function AnnouncementPopup() {
  const { colors } = useTheme();
  const [item, setItem] = useState<Announcement | null>(null);

  const check = useCallback(async () => {
    const latest = await getActiveAnnouncement();
    if (latest && !(await wasSeen(latest.id))) setItem(latest);
  }, []);

  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, [check]);

  const close = () => {
    if (item) markSeen(item.id);
    setItem(null);
  };

  return (
    <Modal visible={!!item} transparent animationType="fade" onRequestClose={close}>
      <View style={[styles.backdrop, { backgroundColor: colors.scrim }]}>
        <View
          style={{
            width: '100%',
            maxWidth: 420,
            maxHeight: '75%',
            backgroundColor: colors.bg,
            borderRadius: radius.lg,
            borderWidth: StyleSheet.hairlineWidth * 2,
            borderColor: colors.border,
            padding: space.xl,
            gap: space.md,
          }}
        >
          <Text style={[typography.h3, { color: colors.text }]}>{item?.title}</Text>
          <ScrollView contentContainerStyle={{ gap: space.md }}>
            {item?.attachments.map((file, i) => <AttachmentView key={i} file={file} />)}
            {item ? <RichText source={item.body} /> : null}
          </ScrollView>
          <Button label="Got it" onPress={close} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
});
