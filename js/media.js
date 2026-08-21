import { escapeHtml } from './utils.js';

// Turning a pasted link into something playable in the page.
//
// Security note that shapes the whole file: a user-supplied URL is never
// put into an iframe src. Each provider is matched against an allowlist of
// hosts, the id is extracted, and the embed URL is rebuilt from a template
// here. Passing the original string through would let anyone point an
// iframe at anything they liked.
const YOUTUBE_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be'];
const VIMEO_HOSTS = ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'];
const SPOTIFY_HOSTS = ['open.spotify.com'];
const SOUNDCLOUD_HOSTS = ['soundcloud.com', 'www.soundcloud.com', 'on.soundcloud.com'];

const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|aac|flac)(\?.*)?$/i;
const VIDEO_EXT = /\.(mp4|webm|ogv|mov)(\?.*)?$/i;
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|svg|bmp)(\?.*)?$/i;

// Only ids that look like ids - keeps anything odd out of the rebuilt URL.
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

function parseUrl(raw) {
  try {
    const url = new URL(String(raw).trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

function youtubeId(url) {
  if (url.hostname.endsWith('youtu.be')) return url.pathname.slice(1).split('/')[0];
  if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/')[2];
  if (url.pathname.startsWith('/embed/')) return url.pathname.split('/')[2];
  return url.searchParams.get('v') || '';
}

// Returns { kind, embedUrl?, src?, provider } or null when the link isn't
// something we can play. `kind` is what the renderer switches on.
//
// `typeHint` is the entry's declared type. It matters because plenty of
// image hosts serve without a file extension (picsum, unsplash, most
// CDNs), so extension sniffing alone quietly fails on perfectly good
// image links - if someone said this is an image, believe them.
export function parseMedia(raw, typeHint = '') {
  const url = parseUrl(raw);
  if (!url) return null;
  const host = url.hostname.toLowerCase();

  if (YOUTUBE_HOSTS.includes(host)) {
    const id = youtubeId(url);
    if (SAFE_ID.test(id)) return { kind: 'iframe', provider: 'YouTube', embedUrl: `https://www.youtube.com/embed/${id}` };
  }

  if (VIMEO_HOSTS.includes(host)) {
    const id = url.pathname.split('/').filter(Boolean).pop() || '';
    if (/^\d+$/.test(id)) return { kind: 'iframe', provider: 'Vimeo', embedUrl: `https://player.vimeo.com/video/${id}` };
  }

  if (SPOTIFY_HOSTS.includes(host)) {
    const parts = url.pathname.split('/').filter(Boolean);
    // /track/ID, /album/ID, /playlist/ID - and the /embed/ form of each.
    const kindIndex = parts[0] === 'embed' ? 1 : 0;
    const what = parts[kindIndex];
    const id = parts[kindIndex + 1] || '';
    if (['track', 'album', 'playlist', 'episode', 'show'].includes(what) && SAFE_ID.test(id)) {
      return { kind: 'iframe', provider: 'Spotify', embedUrl: `https://open.spotify.com/embed/${what}/${id}`, compact: true };
    }
  }

  if (SOUNDCLOUD_HOSTS.includes(host)) {
    // SoundCloud's player takes the track URL as a parameter rather than an
    // id, so this is the one case where the original URL travels - the host
    // check above is what makes that safe, and it's re-encoded here.
    return {
      kind: 'iframe',
      provider: 'SoundCloud',
      embedUrl: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url.href)}&color=%234f46e5`,
      compact: true,
    };
  }

  if (AUDIO_EXT.test(url.pathname)) return { kind: 'audio', provider: 'Audio', src: url.href, compact: true };
  if (VIDEO_EXT.test(url.pathname)) return { kind: 'video', provider: 'Video', src: url.href };
  if (IMAGE_EXT.test(url.pathname)) return { kind: 'image', provider: 'Image', src: url.href };

  if (typeHint === 'image') return { kind: 'image', provider: 'Image', src: url.href };

  return null;
}

export function canEmbed(raw, typeHint = '') {
  return parseMedia(raw, typeHint) !== null;
}

// `inline` is the feed variant: muted and loop-friendly, because a wall of
// cards all shouting at once is the fastest way to make a feed unusable.
export function mediaHtml(raw, { inline = false, typeHint = '' } = {}) {
  const media = parseMedia(raw, typeHint);
  if (!media) return '';

  if (media.kind === 'iframe') {
    return `<div class="media-frame${media.compact ? ' is-compact' : ''}">
      <iframe src="${escapeHtml(media.embedUrl)}" loading="lazy" allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" title="${escapeHtml(media.provider)} player"></iframe>
    </div>`;
  }

  if (media.kind === 'video') {
    return `<div class="media-frame"><video src="${escapeHtml(media.src)}" ${
      inline ? 'muted loop playsinline' : 'controls playsinline'
    } preload="metadata"></video></div>`;
  }

  if (media.kind === 'audio') {
    return `<div class="media-audio"><audio src="${escapeHtml(media.src)}" controls preload="none"></audio></div>`;
  }

  if (media.kind === 'image') {
    // A guessed image URL can turn out not to be one; drop the box rather
    // than leaving a broken-image placeholder sitting in the layout.
    return `<div class="media-image"><img src="${escapeHtml(media.src)}" alt="" loading="lazy" onerror="this.parentElement.remove()" /></div>`;
  }

  return '';
}
