import React, { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { useTheme } from '../theme/ThemeProvider';

// The provider players, in-process, using the same iframes the web build
// embeds. None of YouTube, Vimeo, Spotify or SoundCloud exposes a playable
// stream URL, so this is the only way to show one without handing off to the
// official app.
//
// Everything user-supplied has already been through lib/media: the host was
// matched against a fixed list and the id extracted and re-templated, so the
// URL arriving here was built by us, not pasted by someone. Two things still
// hold the WebView to it:
//
//   - `allowedHosts` comes from the same resolver. The player may navigate
//     within those hosts and nowhere else; a tap on a video title, a channel,
//     or a "listen on" badge leaves through the OS instead, which is what the
//     app already did with a provider link. Matching is on the whole hostname,
//     so a lookalike like youtube.com.evil.test does not pass.
//   - setSupportMultipleWindows={false} keeps target=_blank on that same path
//     rather than letting it open a window that skips the check.

function hostOf(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function ProviderEmbed({
  embedUrl,
  allowedHosts,
  height,
  autoplayParams,
  onNavigateOut,
}: {
  embedUrl: string;
  allowedHosts: string[];
  height: number;
  /** Feed use: appended to make the embed autoplay, which it may only do muted. */
  autoplayParams?: string;
  /** Called with a URL the player tried to open outside itself. */
  onNavigateOut?: (url: string) => void;
}) {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);

  if (!embedUrl || allowedHosts.length === 0) return null;
  // Only ever extend a URL this app built; never accept one to load wholesale.
  if (!allowedHosts.includes(hostOf(embedUrl))) return null;

  const uri = autoplayParams
    ? embedUrl + (embedUrl.includes('?') ? '&' : '?') + autoplayParams
    : embedUrl;

  return (
    <View style={{ width: '100%', height, backgroundColor: '#000' }}>
      <WebView
        source={{ uri }}
        style={{ flex: 1, backgroundColor: '#000' }}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={!autoplayParams}
        allowsFullscreenVideo
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        onLoadEnd={() => setLoading(false)}
        onShouldStartLoadWithRequest={(req) => {
          if (req.url === uri) return true;
          if (allowedHosts.includes(hostOf(req.url))) return true;
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
