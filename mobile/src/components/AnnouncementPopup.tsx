import React, { useCallback, useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { AppState, Modal, ScrollView, StyleSheet, View } from 'react-native';

import { Announcement, getActiveAnnouncement, markSeen, wasSeen } from '../data/announcements';
import { safeUrl } from '../lib/utils';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, typography } from '../theme/tokens';
import { RichText } from './RichText';
import { Text } from './Text';
import { Button } from './ui';

function Film({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
  });
  return (
    <VideoView
      player={player}
      style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: radius.md, backgroundColor: '#000' }}
      contentFit="contain"
      nativeControls
    />
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

  const image = item ? safeUrl(item.imageUrl) : '';
  const video = item ? safeUrl(item.videoUrl) : '';

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
            {image ? (
              <Image
                source={{ uri: image }}
                style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: radius.md }}
                contentFit="cover"
              />
            ) : null}
            {video ? <Film url={video} /> : null}
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
