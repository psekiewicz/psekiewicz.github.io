import { showToast } from './toast.js';

// Sharing a link is the one thing every social app has and this didn't.
// navigator.share is the native sheet on phones (and is what makes this
// worth having at all); everywhere else it falls back to the clipboard,
// and if even that's unavailable the URL is shown so it can be copied by
// hand. Both APIs need a user gesture, so only ever call this from a
// click handler.
export async function shareLink({ url, title, text = '' }) {
  const absolute = new URL(url, window.location.origin).href;

  if (navigator.share) {
    try {
      await navigator.share({ title, text, url: absolute });
      return 'shared';
    } catch (err) {
      // AbortError means the user closed the sheet on purpose - treat that
      // as done rather than falling through to copying behind their back.
      if (err && err.name === 'AbortError') return 'cancelled';
    }
  }

  try {
    await navigator.clipboard.writeText(absolute);
    showToast({ title: 'Link copied', body: title, iconName: 'share', duration: 3500 });
    return 'copied';
  } catch {
    showToast({ title: 'Copy this link', body: absolute, iconName: 'share', duration: 9000 });
    return 'manual';
  }
}
