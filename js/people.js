import { effectClass } from './shop-items.js';
import { avatarHtml, escapeHtml } from './utils.js';

// How a person is drawn wherever they appear - a demo, a comment, a news
// byline, a notification, the leaderboard: their avatar in the border they
// bought, their name in the effect they bought. What you buy in the shop is
// how everyone sees you everywhere, not only on your profile page.
//
// `profile` is a row shaped by js/profiles-data.js, or null/undefined while
// it isn't loaded (or the account is gone); `fallbackName` is the name stored
// on the content itself.

export function personAvatar(profile, fallbackName, sizeClass = '') {
  const classes = [sizeClass, profile ? effectClass(profile.equippedBorder) : ''].filter(Boolean).join(' ');
  return avatarHtml(profile ? profile.avatarUrl : '', (profile && profile.displayName) || fallbackName, classes);
}

export function personName(profile, fallbackName) {
  const name = escapeHtml((profile && profile.displayName) || fallbackName || 'Unknown');
  const fx = profile ? effectClass(profile.equippedNameEffect) : '';
  return fx ? `<span class="${fx}">${name}</span>` : name;
}
