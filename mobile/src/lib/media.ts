import { safeUrl } from './utils';

// The web build (js/media.js) turns a media URL into either a native <video>/
// <audio>/<img> or a provider iframe. There are no iframes here, and by design
// no WebView either - so the split matters more:
//
//   direct  - an .mp4/.mp3/.jpg URL plays or renders in a real Android player
//             (expo-video / expo-image). This is the native path.
//   provider- YouTube, Vimeo, Spotify and SoundCloud do not expose a playable
//             stream URL; the only way to play them in-process is the embed,
//             which means a WebView. All four now carry one (rendered by
//             components/ProviderEmbed), the same iframes the web build uses,
//             so none of them has to leave the app. Every provider keeps its
//             `url` too, so "open in the real app" stays available beside the
//             player - the embeds hide comments, the channel and anything
//             wanting a signed-in account.
//
// `embedHosts` is the allowlist the WebView is held to: the player may load
// and navigate within those and nowhere else, so a tap on a title or a
// "listen on" badge leaves through the OS rather than turning the embed into
// a general-purpose browser. `compact` marks the audio-shaped players, which
// get a short fixed frame instead of a video surface.
//
// The allowlist is kept for the same reason the web build keeps one: the id is
// extracted and the URL rebuilt from a template here, so a user-supplied link
// can never send the OS somewhere of its own choosing.

export type Media =
  | { kind: 'video'; url: string }
  | { kind: 'audio'; url: string }
  | { kind: 'image'; url: string }
  | {
      kind: 'provider';
      provider: string;
      label: string;
      url: string;
      id?: string;
      embedUrl?: string;
      embedHosts?: string[];
      /** Extra query params that make this provider's embed autoplay muted. */
      embedAutoplay?: string;
      /** Audio-shaped: a short frame rather than a 16:9 surface. */
      compact?: boolean;
    }
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
      id: ytId,
      embedUrl: `https://www.youtube-nocookie.com/embed/${ytId}?playsinline=1&rel=0&modestbranding=1`,
      embedHosts: [
        'www.youtube-nocookie.com',
        'youtube-nocookie.com',
        'www.youtube.com',
        'youtube.com',
        'm.youtube.com',
      ],
      embedAutoplay: 'autoplay=1&mute=1',
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
        id,
        embedUrl: `https://player.vimeo.com/video/${id}?playsinline=1`,
        embedHosts: ['player.vimeo.com', 'vimeo.com', 'www.vimeo.com'],
        embedAutoplay: 'autoplay=1&muted=1',
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
        id: match[2],
        embedUrl: `https://open.spotify.com/embed/${match[1]}/${match[2]}`,
        embedHosts: ['open.spotify.com', 'spotify.com'],
        compact: true,
      };
    }
  }

  if (host === 'soundcloud.com' || host === 'm.soundcloud.com') {
    return {
      kind: 'provider',
      provider: 'soundcloud',
      label: 'Open in SoundCloud',
      url,
      embedUrl: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%23c67139`,
      embedHosts: ['w.soundcloud.com', 'soundcloud.com', 'm.soundcloud.com'],
      compact: true,
    };
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

/** YouTube publishes a still at a predictable path; nothing else here does. */
export function posterFor(url: string) {
  const media = resolveMedia(url);
  if (!media) return null;
  if (media.kind === 'image') return media.url;
  if (media.kind === 'provider' && media.provider === 'youtube' && media.id) {
    return `https://i.ytimg.com/vi/${media.id}/hqdefault.jpg`;
  }
  return null;
}

/**
 * The picture a feed card or grid tile shows for an entry: its own cover image,
 * else a still from its media. Without the fallback a YouTube entry with no
 * cover sat on a flat gradient in the feed while its own page showed the video.
 */
export function coverFor(project: { imageUrl?: string; mediaUrl?: string }) {
  return project.imageUrl || (project.mediaUrl ? posterFor(project.mediaUrl) : null) || '';
}
