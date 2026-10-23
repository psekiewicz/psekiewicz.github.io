import { safeUrl } from './utils';
import { firstImage } from './markdown';

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

// Which forms of each provider's links are understood is kept identical to
// parseMedia in js/media.js - they used to differ, so a link that played in the
// app showed as a bare link on the site and the other way round.
const VIDEO_EXT = /\.(mp4|m4v|webm|mov)(\?|#|$)/i;
const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|flac)(\?|#|$)/i;
const IMAGE_EXT = /\.(png|jpe?g|jfif|gif|webp|avif|bmp|svg)(\?|#|$)/i;

const YOUTUBE_HOSTS = ['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com'];

/**
 * A link typed or copied without its scheme - "youtu.be/abc",
 * "www.youtube.com/watch?v=abc" - gets https:// in front. Same as withScheme
 * in js/media.js.
 */
export function withScheme(raw: string) {
  const value = String(raw ?? '').trim();
  if (!value || /^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+(?=[/?#]|$)/i.test(value) ? `https://${value}` : value;
}

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
    if (YOUTUBE_HOSTS.includes(host)) {
      if (u.pathname === '/watch') return u.searchParams.get('v') || '';
      const shorts = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]+)/);
      if (shorts) return shorts[1];
    }
  } catch {
    /* fall through */
  }
  return '';
}

export function resolveMedia(rawUrl: string, declaredType?: string): Media {
  const url = safeUrl(withScheme(rawUrl));
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
    // vimeo.com/ID, vimeo.com/channels/x/ID, player.vimeo.com/video/ID - and an
    // unlisted video's vimeo.com/ID/HASH or ?h=HASH. Without the hash an
    // unlisted video does not play, so it travels into the embed.
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    const at = parts.findIndex((p) => /^\d+$/.test(p));
    const id = at === -1 ? '' : parts[at];
    const rawHash = u.searchParams.get('h') || (/^[0-9a-f]{6,}$/i.test(parts[at + 1] || '') ? parts[at + 1] : '');
    const hash = /^[0-9a-f]{6,64}$/i.test(rawHash) ? rawHash : '';
    if (id) {
      return {
        kind: 'provider',
        provider: 'vimeo',
        label: 'Open in Vimeo',
        url: `https://vimeo.com/${id}${hash ? `/${hash}` : ''}`,
        id,
        embedUrl: `https://player.vimeo.com/video/${id}?playsinline=1${hash ? `&h=${hash}` : ''}`,
        embedHosts: ['player.vimeo.com', 'vimeo.com', 'www.vimeo.com'],
        embedAutoplay: 'autoplay=1&muted=1',
      };
    }
  }

  if (host === 'open.spotify.com' || host === 'spotify.com') {
    // Links copied in a localised Spotify carry the locale first: /intl-pl/track/ID.
    const match = url.match(/spotify\.com\/(?:intl-[a-z-]+\/)?(?:embed\/)?(track|album|playlist|episode|show)\/([A-Za-z0-9]+)/i);
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

  if (host === 'soundcloud.com' || host === 'm.soundcloud.com' || host === 'on.soundcloud.com') {
    // The player resolves soundcloud.com addresses, not the mobile site's.
    const trackUrl = url.replace('//m.soundcloud.com', '//soundcloud.com');
    return {
      kind: 'provider',
      provider: 'soundcloud',
      label: 'Open in SoundCloud',
      url: trackUrl,
      embedUrl: `https://w.soundcloud.com/player/?url=${encodeURIComponent(trackUrl)}&color=%231f7a99`,
      embedHosts: ['w.soundcloud.com', 'soundcloud.com', 'm.soundcloud.com', 'on.soundcloud.com'],
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
// Clips uploaded here (lib/upload.ts, js/uploads-data.js) have a still saved
// beside them as <name>.poster.webp. Kept identical to uploadedPosterFor in
// js/media.js.
const UPLOADED_CLIP = /\/storage\/v1\/object\/public\/uploads\/[^?#]+\.(mp4|webm)$/i;

export function uploadedPosterFor(src: string) {
  try {
    const url = new URL(src);
    if (!/^https?:$/.test(url.protocol) || !UPLOADED_CLIP.test(url.pathname)) return '';
    return `${url.origin}${url.pathname.replace(/\.(mp4|webm)$/i, '.poster.webp')}`;
  } catch {
    return '';
  }
}

export function posterFor(url: string) {
  const media = resolveMedia(url);
  if (!media) return null;
  if (media.kind === 'image') return media.url;
  if (media.kind === 'video') return uploadedPosterFor(media.url) || null;
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
export function coverFor(project: { imageUrl?: string; mediaUrl?: string; description?: string }) {
  return (
    project.imageUrl ||
    (project.mediaUrl ? posterFor(project.mediaUrl) : null) ||
    firstImage(project.description) ||
    ''
  );
}
