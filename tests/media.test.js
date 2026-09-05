import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installWindow } from './helpers/browser-env.js';

installWindow('https://example.com');

const { parseMedia, canEmbed, mediaHtml } = await import('../js/media.js');

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
