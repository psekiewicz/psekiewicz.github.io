import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installWindow } from './helpers/browser-env.js';

installWindow('https://example.com');

const { parseMedia, canEmbed, mediaHtml, uploadedPosterFor } = await import('../js/media.js');

test('parseMedia recognises a YouTube watch URL', () => {
  const media = parseMedia('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(media.kind, 'iframe');
  assert.equal(media.provider, 'YouTube');
  assert.equal(media.embedUrl, 'https://www.youtube.com/embed/dQw4w9WgXcQ');
});

test('parseMedia recognises a youtu.be short link', () => {
  const media = parseMedia('https://youtu.be/dQw4w9WgXcQ');
  assert.equal(media.provider, 'YouTube');
  assert.equal(media.embedUrl, 'https://www.youtube.com/embed/dQw4w9WgXcQ');
});

test('parseMedia recognises a Vimeo URL', () => {
  const media = parseMedia('https://vimeo.com/123456789');
  assert.equal(media.provider, 'Vimeo');
  assert.equal(media.embedUrl, 'https://player.vimeo.com/video/123456789');
});

test('parseMedia recognises Spotify track/album/playlist links', () => {
  const track = parseMedia('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC');
  assert.equal(track.provider, 'Spotify');
  assert.equal(track.embedUrl, 'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC');
  assert.equal(track.compact, true);
});

test('parseMedia recognises direct audio/video/image file extensions', () => {
  assert.equal(parseMedia('https://example.com/song.mp3').kind, 'audio');
  assert.equal(parseMedia('https://example.com/clip.mp4').kind, 'video');
  assert.equal(parseMedia('https://example.com/pic.png').kind, 'image');
});

test('parseMedia returns null for an unrecognised URL with no type hint', () => {
  assert.equal(parseMedia('https://example.com/whatever'), null);
});

test('parseMedia falls back to typeHint "image" for an otherwise-unrecognised URL', () => {
  const media = parseMedia('https://example.com/whatever', 'image');
  assert.equal(media.kind, 'image');
});

test('parseMedia rejects a YouTube id containing unsafe characters', () => {
  // SAFE_ID guards the id that gets interpolated straight into embedUrl -
  // it must reject anything that isn't the expected id shape.
  assert.equal(parseMedia('https://www.youtube.com/watch?v=<script>'), null);
});

test('parseMedia returns null for garbage input', () => {
  assert.equal(parseMedia(''), null);
  assert.equal(parseMedia(null), null);
  assert.equal(parseMedia('not a url'), null);
});

test('canEmbed mirrors parseMedia', () => {
  assert.equal(canEmbed('https://vimeo.com/123456789'), true);
  assert.equal(canEmbed('https://example.com/whatever'), false);
});

test('mediaHtml escapes the media src/embed URL into the markup', () => {
  const html = mediaHtml('https://example.com/clip.mp4');
  assert.match(html, /<video src="https:\/\/example\.com\/clip\.mp4"/);
  assert.match(html, / controls playsinline/);
});

test('mediaHtml renders inline video as muted/loop instead of controls', () => {
  const html = mediaHtml('https://example.com/clip.mp4', { inline: true });
  assert.match(html, / muted loop playsinline/);
  assert.doesNotMatch(html, /controls/);
});

test('mediaHtml returns an empty string for unrecognised media', () => {
  assert.equal(mediaHtml('https://example.com/whatever'), '');
});

test('an uploaded clip points at the poster saved beside it; other videos have none', () => {
  const clip = 'https://x.supabase.co/storage/v1/object/public/uploads/u1/171-abc.mp4';
  assert.equal(uploadedPosterFor(clip), 'https://x.supabase.co/storage/v1/object/public/uploads/u1/171-abc.poster.webp');
  assert.equal(uploadedPosterFor(clip.replace('.mp4', '.webm') + '?t=3'), 'https://x.supabase.co/storage/v1/object/public/uploads/u1/171-abc.poster.webp');
  assert.equal(uploadedPosterFor('https://example.com/clip.mp4'), '');
  assert.match(mediaHtml(clip, { inline: true }), /poster="[^"]+\.poster\.webp"/);
  assert.doesNotMatch(mediaHtml('https://example.com/clip.mp4', { inline: true }), /poster=/);
});

// Forms that used to come back as "can't play this link" on the site - most
// of them played in the app, which was the "works only sometimes" report.
test('parseMedia understands the other forms of YouTube links', () => {
  for (const url of [
    'https://www.youtube.com/live/dQw4w9WgXcQ?si=x',
    'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  ]) {
    assert.equal(parseMedia(url)?.embedUrl, 'https://www.youtube.com/embed/dQw4w9WgXcQ', url);
  }
});

test('parseMedia keeps the hash an unlisted Vimeo video needs', () => {
  assert.equal(parseMedia('https://vimeo.com/76979871/abcdef1234').embedUrl, 'https://player.vimeo.com/video/76979871?h=abcdef1234');
  assert.equal(parseMedia('https://player.vimeo.com/video/76979871?h=abcdef1234').embedUrl, 'https://player.vimeo.com/video/76979871?h=abcdef1234');
});

test('parseMedia reads localised Spotify links and mobile SoundCloud ones', () => {
  assert.equal(
    parseMedia('https://open.spotify.com/intl-pl/track/4uLU6hMCjMI75M1A2tKUQC').embedUrl,
    'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC'
  );
  assert.match(parseMedia('https://m.soundcloud.com/artist/track').embedUrl, /url=https%3A%2F%2Fsoundcloud\.com%2Fartist%2Ftrack/);
});

test('a link pasted without https:// still plays, and is saved with it', async () => {
  const { withScheme } = await import('../js/media.js');
  assert.equal(parseMedia('youtu.be/dQw4w9WgXcQ')?.provider, 'YouTube');
  assert.equal(parseMedia('www.example.com/clip.m4v')?.kind, 'video');
  assert.equal(withScheme(' youtu.be/abc '), 'https://youtu.be/abc');
  assert.equal(withScheme('https://youtu.be/abc'), 'https://youtu.be/abc');
  assert.equal(withScheme('not a link'), 'not a link');
  assert.equal(withScheme('javascript:alert(1)'), 'javascript:alert(1)');
});
