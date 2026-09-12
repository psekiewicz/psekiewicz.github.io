import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { useTheme } from '../theme/ThemeProvider';

// The provider players, in-process, using the same iframes the web build
// embeds. None of YouTube, Vimeo, Spotify or SoundCloud exposes a playable
// stream URL, so this is the only way to show one without handing off to the
// official app.
//
// The player is loaded the way the name says - embedded. The first version
// pointed the WebView straight at the /embed/ URL as its top-level document,
// which reads as a reasonable shortcut and is not: those endpoints exist to be
// an iframe inside somebody's page, and they check who that somebody is. Loaded
// top-level there is no embedder, so no Referer and no origin, and YouTube
// refuses to play with "Video unavailable" and error 153 - the same answer it
// gives a site that isn't allowed to embed. Vimeo, Spotify and SoundCloud are
// laxer but make the same assumption.
//
// So the WebView loads a page of ours, with the provider in an iframe on it,
// and `baseUrl` gives that page the site's own origin. Android does this with
// loadDataWithBaseURL and iOS with loadHTMLString:baseURL:, and either way the
// provider now sees a request from https://psekiewicz.github.io - the same
// origin the web build embeds from, so a video that plays on the site plays
// here.
//
// Everything user-supplied has already been through lib/media: the host was
// matched against a fixed list and the id extracted and re-templated, so the
// URL going into that iframe was built by us, not pasted by someone.
// `allowedHosts` comes from the same resolver and is checked again here, so a
// lookalike like youtube.com.evil.test cannot be the thing we embed.
//
// What the main frame is allowed to become is then a much simpler rule than it
// used to be: our own page, and nothing else. Tapping a video title, a channel
// or a "listen on" badge leaves through the OS, which is what the app already
// did with a provider link and what the download page says happens.
// setSupportMultipleWindows={false} is what keeps target=_blank on that path
// instead of opening a window that skips the check.

const EMBED_ORIGIN = 'https://psekiewicz.github.io';

/** The spinner can't be allowed to outlive a player that never reports in. */
const READY_FALLBACK = 2500;

function hostOf(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function wrapperPage(src: string) {
  // src is a URL this app templated and then host-checked, but it is being
  // written into markup, so the four characters that could end the attribute
  // or open a tag are escaped anyway.
  const safe = src.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: #000; overflow: hidden; }
  iframe { display: block; border: 0; width: 100%; height: 100%; }
</style>
</head>
<body>
<iframe
  src="${safe}"
  allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
  referrerpolicy="strict-origin-when-cross-origin"
  allowfullscreen
  onload="window.ReactNativeWebView && window.ReactNativeWebView.postMessage('ready')"
></iframe>
</body>
</html>`;
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
  const fallback = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (fallback.current) clearTimeout(fallback.current);
  }, []);

  if (!embedUrl || allowedHosts.length === 0) return null;
  // Only ever embed a URL this app built; never accept one to load wholesale.
  if (!allowedHosts.includes(hostOf(embedUrl))) return null;

  const uri = autoplayParams
    ? embedUrl + (embedUrl.includes('?') ? '&' : '?') + autoplayParams
    : embedUrl;

  // Our page, in the two shapes the platforms report it as.
  const isWrapper = (url: string) =>
    url === 'about:blank' || url === EMBED_ORIGIN || url === `${EMBED_ORIGIN}/`;

  return (
    <View style={{ width: '100%', height, backgroundColor: '#000' }}>
      <WebView
        source={{ html: wrapperPage(uri), baseUrl: EMBED_ORIGIN }}
        style={{ flex: 1, backgroundColor: '#000' }}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={!autoplayParams}
        allowsFullscreenVideo
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        // The iframe reporting that it has loaded. Only the fact of the message
        // is used, never its contents - it comes from a page with a provider on
        // it and is not something to act on.
        onMessage={() => setLoading(false)}
        onLoadEnd={() => {
          if (fallback.current) clearTimeout(fallback.current);
          fallback.current = setTimeout(() => setLoading(false), READY_FALLBACK);
        }}
        onShouldStartLoadWithRequest={(req) => {
          // iOS reports sub-frame loads here too; that is the player loading
          // itself inside our page, not a navigation away from it. Android
          // only ever asks about the main frame.
          if (req.isTopFrame === false) return true;
          if (isWrapper(req.url) || req.url === uri) return true;
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
