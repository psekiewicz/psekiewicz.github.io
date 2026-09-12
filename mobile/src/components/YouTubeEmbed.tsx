import React, { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { useTheme } from '../theme/ThemeProvider';

// YouTube in-process, via the same iframe player the web build embeds. There is
// no playable stream URL behind a YouTube link, so this is the only way to show
// one without handing off to the official app.
//
// The id reaching here was extracted by lib/media's own parser and is
// re-validated below before it goes anywhere near a URL, so a user-supplied
// media link can never steer this WebView: it only ever loads
// youtube-nocookie.com/embed/<id>, and onShouldStartLoadWithRequest refuses to
// follow it anywhere off YouTube's own hosts (taps on the title, the channel
// avatar, "Watch on YouTube") - those go to the OS instead, which is what the
// rest of the app already does with a provider link.

/** YouTube ids are 11 chars of the URL-safe base64 alphabet. */
const ID = /^[\w-]{11}$/;

const ALLOWED_HOSTS = [
  'www.youtube-nocookie.com',
  'youtube-nocookie.com',
  'www.youtube.com',
  'youtube.com',
  'm.youtube.com',
];

function hostOf(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function YouTubeEmbed({
  videoId,
  height,
  autoplay = false,
  onNavigateOut,
}: {
  videoId: string;
  height: number;
  /** Feed use: start muted, the only way an embed is allowed to autoplay. */
  autoplay?: boolean;
  /** Called with a URL the player tried to open outside itself. */
  onNavigateOut?: (url: string) => void;
}) {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);

  if (!ID.test(videoId)) return null;

  const params = [
    'playsinline=1',
    'rel=0',
    'modestbranding=1',
    `autoplay=${autoplay ? 1 : 0}`,
    // An embed may only autoplay while muted; unmuted autoplay is refused and
    // you get a still frame instead of a video.
    `mute=${autoplay ? 1 : 0}`,
  ].join('&');
  const uri = `https://www.youtube-nocookie.com/embed/${videoId}?${params}`;

  return (
    <View style={{ width: '100%', height, backgroundColor: '#000' }}>
      <WebView
        source={{ uri }}
        style={{ flex: 1, backgroundColor: '#000' }}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={!autoplay}
        allowsFullscreenVideo
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        onLoadEnd={() => setLoading(false)}
        onShouldStartLoadWithRequest={(req) => {
          // The first load is the embed itself; everything after that is the
          // player trying to send you somewhere.
          if (req.url === uri) return true;
          if (ALLOWED_HOSTS.includes(hostOf(req.url))) return true;
          onNavigateOut?.(req.url);
          return false;
        }}
      />
      {loading ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}
    </View>
  );
}
