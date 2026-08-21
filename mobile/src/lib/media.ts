import { safeUrl } from './utils';

// The web build (js/media.js) turns a media URL into either a native <video>/
// <audio>/<img> or a provider iframe. There are no iframes here, and by design
// no WebView either - so the split matters more:
//
//   direct  - an .mp4/.mp3/.jpg URL plays or renders in a real Android player
//             (expo-video / expo-image). This is the native path.
//   provider- YouTube, Vimeo, Spotify and SoundCloud do not expose a playable
//             stream URL; the only in-app way to play them is the embed, which
//             means a WebView. Rather than smuggle one in, the app resolves the
//             canonical link and hands it to Android, which opens the official
//             app if it's installed and the browser otherwise. That's the same
//             thing tapping a link in any native app does.
//
// The allowlist is kept for the same reason the web build keeps one: the id is
// extracted and the URL rebuilt from a template here, so a user-supplied link
// can never send the OS somewhere of its own choosing.

export type Media =
  | { kind: 'video'; url: string }
  | { kind: 'audio'; url: string }
  | { kind: 'image'; url: string }
  | { kind: 'provider'; provider: string; label: string; url: string }
  | { kind: 'link'; url: string }
  | null;

const VIDEO_EXT = /\.(mp4|m4v|webm|mov)(\?|#|$)/i;
const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|flac)(\?|#|$)/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|svg)(\?|#|$)/i;

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function youtubeId(url: string) {
  try {
    const u = new URL(url);
    const host = hostOf(url);
    if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || '';
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      if (u.pathname === '/watch') return u.searchParams.get('v') || '';
      const shorts = u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]+)/);
      if (shorts) return shorts[1];
    }
  } catch {
    /* fall through */
  }
  return '';
}

export function resolveMedia(rawUrl: string, declaredType?: string): Media {
  const url = safeUrl(rawUrl);
  if (!url) return null;

  const host = hostOf(url);

  // Providers first: a Spotify link can end in something that looks like a
  // file extension, and the host is the more reliable signal.
  const ytId = youtubeId(url);
  if (ytId) {
    return {
      kind: 'provider',
      provider: 'youtube',
      label: 'Open in YouTube',
      url: `https://www.youtube.com/watch?v=${encodeURIComponent(ytId)}`,
    };
  }

  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = (url.match(/vimeo\.com\/(?:video\/)?(\d+)/) || [])[1];
    if (id) {
      return {
        kind: 'provider',
        provider: 'vimeo',
        label: 'Open in Vimeo',
        url: `https://vimeo.com/${id}`,
      };
    }
  }

  if (host === 'open.spotify.com' || host === 'spotify.com') {
    const match = url.match(/spotify\.com\/(track|album|playlist|episode|show)\/([A-Za-z0-9]+)/);
    if (match) {
      return {
        kind: 'provider',
        provider: 'spotify',
        label: 'Open in Spotify',
        url: `https://open.spotify.com/${match[1]}/${match[2]}`,
      };
    }
  }

  if (host === 'soundcloud.com' || host === 'm.soundcloud.com') {
    return { kind: 'provider', provider: 'soundcloud', label: 'Open in SoundCloud', url };
  }

  // Then by file extension, which is the native-playback path.
  if (VIDEO_EXT.test(url)) return { kind: 'video', url };
  if (AUDIO_EXT.test(url)) return { kind: 'audio', url };
  if (IMAGE_EXT.test(url)) return { kind: 'image', url };

  // Plenty of image hosts serve without a file extension, so the declared
  // content type acts as the hint - exactly as js/media.js uses it.
  if (declaredType === 'image') return { kind: 'image', url };
  if (declaredType === 'video') return { kind: 'video', url };
  if (declaredType === 'music') return { kind: 'audio', url };

  return { kind: 'link', url };
}
