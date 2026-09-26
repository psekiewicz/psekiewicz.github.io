// What kind of thing an entry is. Drives the badge on cards, the icon next to
// it, and the options in the create/edit form. Mirrors js/utils.js.
export const PROJECT_TYPES: Record<string, { label: string; icon: any }> = {
  music: { label: 'Music', icon: 'music' },
  video: { label: 'Video', icon: 'film' },
  image: { label: 'Image', icon: 'image' },
  app: { label: 'App', icon: 'smartphone' },
  other: { label: 'Other', icon: 'folder' },
};

export const PROJECT_TYPE_OPTIONS = Object.entries(PROJECT_TYPES).map(([value, meta]) => ({
  value,
  label: meta.label,
}));

export function typeMeta(type: string) {
  return PROJECT_TYPES[type] || PROJECT_TYPES.other;
}

export function initials(name: string) {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join('');
}

// There is no innerHTML here, so escaping isn't a concern - but a scheme check
// still is. Anything that isn't plain http(s) comes back empty, so a link is
// inert rather than handed to Linking.openURL, which will happily fire an
// intent:// or a file:// URL at the OS.
export function safeUrl(raw: any) {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

export function timeAgo(isoDate: string) {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  // Past a month it becomes a date. Written the short way a feed writes it -
  // "13 Aug", with the year only when it isn't this one.
  const then = new Date(isoDate);
  const sameYear = then.getFullYear() === new Date().getFullYear();
  return then.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

export function formatCount(n: number) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/**
 * The shape tags are stored in: lower-case, trimmed, no blanks, no
 * duplicates, at most ten.
 *
 * Applied where tags are saved rather than only where they are typed. The
 * editor's tag field enforces the same rules as you add them, but an entry
 * loaded for editing arrives with whatever it was stored with, and that should
 * not be able to come back out un-normalised.
 */
export function normalizeTags(tags: string[]): string[] {
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().toLowerCase();
    if (tag && !out.includes(tag) && out.length < 10) out.push(tag);
  }
  return out;
}

/**
 * The reason an Edge Function gave for turning a request down.
 *
 * supabase-js hands back `data: null` whenever a function answers with a
 * non-2xx status, so reading `data.error` never found anything and every
 * refusal reached the person as "Edge Function returned a non-2xx status
 * code". The body the function sent is on the raw Response in `error.context`.
 */
export async function functionErrorMessage(error: any): Promise<string> {
  try {
    const body = await error?.context?.json();
    if (body && body.error) return String(body.error);
  } catch {
    // Not JSON, or no response at all (a network failure) - use the generic one.
  }
  return error?.message || 'Request failed.';
}
