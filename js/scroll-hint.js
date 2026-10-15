import { stripMarkdown } from './markdown.js';
import { timeAgo, safeUrl } from './utils.js';

// What a Scrolls card is about to hand you.
//
// The card shows one picture and a line of summary, which says nothing about
// what sits behind it: a two-minute read, a video, a running app. This turns
// the entry into a short, honest description - the verb for opening it and the
// facts a person would weigh before deciding to - using only what the entry
// already carries.
const WORDS_PER_MINUTE = 200;
// Below this a post is a caption, and "1 min read" would oversell it.
const MIN_WORDS_FOR_READ_TIME = 40;

const IMAGE_IN_BODY = /!\[[^\]]*\]\([^)\s]+/g;

export function scrollHint(project, media, latestUpdate = null) {
  const words = stripMarkdown(project.description || '').split(/\s+/).filter(Boolean).length;
  const meta = [];
  if (latestUpdate) meta.push(`${latestUpdate.version || 'Updated'} ${timeAgo(latestUpdate.createdAt)}`);

  // A running thing outranks everything else the card could offer: the point
  // of showing a project is that you can try it.
  const live = safeUrl(project.liveUrl);
  let action = 'Open';
  if (live) action = 'Try it';
  else if (media && (media.kind === 'video' || (media.kind === 'iframe' && !media.compact))) action = 'Watch';
  else if (media && (media.kind === 'audio' || media.compact)) action = 'Listen';
  else if (words >= MIN_WORDS_FOR_READ_TIME) action = 'Read';

  if (words >= MIN_WORDS_FOR_READ_TIME) {
    meta.push(`${Math.max(1, Math.round(words / WORDS_PER_MINUTE))} min read`);
  }
  const images = (project.description || '').match(IMAGE_IN_BODY);
  if (images) meta.push(`${images.length} ${images.length === 1 ? 'image' : 'images'}`);
  if (project.repoUrl) meta.push('Source code');

  return { action, meta, href: live || '' };
}
