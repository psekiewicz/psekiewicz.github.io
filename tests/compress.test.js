import { test } from 'node:test';
import assert from 'node:assert/strict';

const { fitWithin, pickRecorderType, baseType, extensionFor, clipIsSmallEnough, formatBytes, VIDEO_LIMITS } =
  await import('../js/compress.js');

test('fitWithin shrinks the longer side to the limit and keeps the shape', () => {
  assert.deepEqual(fitWithin(4000, 3000, 1600), { width: 1600, height: 1200 });
  assert.deepEqual(fitWithin(1080, 1920, 1280), { width: 720, height: 1280 });
});

test('fitWithin never enlarges, and rounds to even sizes for video encoders', () => {
  assert.deepEqual(fitWithin(800, 600, 1600), { width: 800, height: 600 });
  const { width, height } = fitWithin(1921, 1081, 1280);
  assert.equal(width % 2, 0);
  assert.equal(height % 2, 0);
});

test('pickRecorderType prefers MP4 and falls back to WebM, or nothing', () => {
  assert.match(pickRecorderType((t) => t.startsWith('video/mp4')), /^video\/mp4/);
  assert.equal(pickRecorderType((t) => t === 'video/webm;codecs=vp8,opus'), 'video/webm;codecs=vp8,opus');
  assert.equal(pickRecorderType(() => false), '');
});

test('baseType and extensionFor read the bucket type out of a recorder type', () => {
  assert.equal(baseType('video/mp4;codecs=avc1,opus'), 'video/mp4');
  assert.equal(extensionFor('video/webm;codecs=vp9,opus'), 'webm');
  assert.equal(extensionFor('image/jpeg'), 'jpg');
  assert.equal(extensionFor('video/quicktime'), '');
});

test('a clip already within the limits goes up as it is; a big or odd one is re-recorded', () => {
  const small = { type: 'video/mp4', size: 3_000_000, width: 1280, height: 720, duration: 20 };
  assert.equal(clipIsSmallEnough(small), true);
  assert.equal(clipIsSmallEnough({ ...small, size: 40_000_000 }), false);
  assert.equal(clipIsSmallEnough({ ...small, width: 1920, height: 1080 }), false);
  assert.equal(clipIsSmallEnough({ ...small, type: 'video/quicktime' }), false);
  assert.equal(VIDEO_LIMITS.maxSeconds, 60);
});

test('formatBytes reads like a person would say it', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(2048), '2 KB');
  assert.equal(formatBytes(3.2 * 1024 * 1024), '3.2 MB');
});
