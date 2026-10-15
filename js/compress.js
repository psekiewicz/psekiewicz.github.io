// Shrinks pictures and video clips on this device, before they are uploaded.
//
// A phone photo is 3-8 MB and a screen recording far more; the post only
// ever shows them a few hundred pixels wide. Squeezing them here saves the
// upload itself, the storage, and every later download. Everything happens in
// the browser - nothing leaves until it is small.
//
// Pictures are redrawn at no more than the size they are shown at and saved
// as WebP (JPEG or PNG where the browser can't write WebP). Redrawing also
// drops the camera's metadata, location included.
//
// Clips are re-encoded to H.264 MP4 at no more than 720p with WebCodecs
// (through Mediabunny, loaded only when a clip is picked): faster than the
// clip plays, at a constant quality rather than a constant bitrate, so a
// mostly still screen recording comes out a fraction of the size of a busy
// one. Browsers without WebCodecs fall back to playing the clip through a
// canvas into a MediaRecorder, which takes as long as the clip itself.
// Either way this is the quick first pass: the weekly ffmpeg job
// (.github/workflows/media-optimize.yml) re-encodes every clip once more,
// slowly and properly, and replaces it if that comes out smaller.
//
// The original is kept whenever it is already as small as the result would be.

// What each picture field shows at most, on the biggest screen it appears on.
export const IMAGE_PRESETS = {
  avatar: { maxSide: 512, quality: 0.85 },
  cover: { maxSide: 1600, quality: 0.82 },
  scroll: { maxSide: 1920, quality: 0.82 },
  inline: { maxSide: 1600, quality: 0.82 },
  attachment: { maxSide: 2048, quality: 0.85 },
};

export const VIDEO_LIMITS = {
  maxSide: 1280,
  // H.264 quantizer, the WebCodecs counterpart of ffmpeg's CRF: lower is
  // better and bigger. Used where the browser supports it; otherwise the
  // bitrate below, as a variable-bitrate target.
  quantizer: 28,
  videoBitsPerSecond: 1_500_000,
  audioBitsPerSecond: 96_000,
  maxSeconds: 60,
};

// Pinned, and only fetched when a clip is actually being compressed.
const MEDIABUNNY = 'https://cdn.jsdelivr.net/npm/mediabunny@1.59.1/dist/bundles/mediabunny.min.mjs';

// A problem with the clip itself (too long, unreadable), as opposed to with
// the browser: the person has to hear about it, rather than the next method
// being tried.
class ClipError extends Error {}

// What the file pickers offer: anything a phone or a screen recorder is
// likely to produce. Whatever it is, what gets uploaded is one of the
// bucket's types (schema.sql).
export const ACCEPT = {
  image: 'image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif',
  media: 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime',
};

// Animated GIFs can't be redrawn without losing the animation, so they go up
// as they are, within this size.
export const GIF_MAX_BYTES = 8 * 1024 * 1024;

// Recorder formats, most widely playable first: MP4 plays everywhere,
// including the Android app; WebM is what older Chrome and Firefox record.
const RECORDER_TYPES = [
  'video/mp4;codecs=avc1.42E01F,mp4a.40.2',
  'video/mp4;codecs=avc1,opus',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

// ------------------------------------------------------------ pure helpers

// Scales (width, height) down - never up - so the longer side fits maxSide.
export function fitWithin(width, height, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  // Even numbers: video encoders need them, and pictures don't mind.
  const even = (n) => Math.max(2, Math.round((n * scale) / 2) * 2);
  return scale === 1 ? { width, height } : { width: even(width), height: even(height) };
}

export function pickRecorderType(isTypeSupported) {
  return RECORDER_TYPES.find((type) => isTypeSupported(type)) || '';
}

// The base type ("video/mp4") a recorder type stands for - what the upload is
// labelled with, and what decides its file extension.
export function baseType(type) {
  return String(type || '').split(';')[0].trim().toLowerCase();
}

export function extensionFor(type) {
  return (
    {
      'image/webp': 'webp',
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'video/mp4': 'mp4',
      'video/webm': 'webm',
    }[baseType(type)] || ''
  );
}

// A clip that is already no bigger than re-recording would make it, and in a
// format every player here takes, goes up untouched.
export function clipIsSmallEnough({ type, size, width, height, duration }, limits = VIDEO_LIMITS) {
  if (!['video/mp4', 'video/webm'].includes(baseType(type))) return false;
  if (Math.max(width, height) > limits.maxSide || !(duration > 0)) return false;
  const budget = ((limits.videoBitsPerSecond + limits.audioBitsPerSecond) * duration) / 8;
  return size <= budget * 1.15;
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ---------------------------------------------------------------- pictures

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function hasTransparency(ctx, width, height) {
  const data = ctx.getImageData(0, 0, width, height).data;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
  return false;
}

async function decodeImage(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Older Safari has createImageBitmap but not for every type, and HEIC
    // decodes only through an <img> there.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();
      return img;
    } catch {
      throw new Error("This picture's format can't be read here. Try a JPEG, PNG or WebP.");
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

// -> a Blob (WebP where possible) no larger than the preset's size, or the
// original file when that is already smaller.
export async function compressImage(file, preset = IMAGE_PRESETS.cover) {
  if (baseType(file.type) === 'image/gif') {
    if (file.size > GIF_MAX_BYTES) {
      throw new Error(`GIFs go up as they are, so they have to be under ${formatBytes(GIF_MAX_BYTES)}.`);
    }
    return file;
  }
  const source = await decodeImage(file);
  const srcW = source.width || source.naturalWidth;
  const srcH = source.height || source.naturalHeight;
  const { width, height } = fitWithin(srcW, srcH, preset.maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  if (source.close) source.close();

  let blob = await canvasToBlob(canvas, 'image/webp', preset.quality);
  // Browsers that can't write WebP hand back a PNG instead; pick JPEG for an
  // opaque picture then, which is far smaller.
  if (!blob || blob.type !== 'image/webp') {
    const transparent = hasTransparency(ctx, width, height);
    blob = transparent
      ? await canvasToBlob(canvas, 'image/png')
      : await canvasToBlob(canvas, 'image/jpeg', preset.quality);
  }
  if (!blob) throw new Error('Could not compress this picture.');

  const keepOriginal =
    ['image/jpeg', 'image/png', 'image/webp'].includes(baseType(file.type)) &&
    width === srcW &&
    height === srcH &&
    file.size <= blob.size;
  return keepOriginal ? file : blob;
}

// ------------------------------------------------------------------- clips

function once(target, event) {
  return new Promise((resolve, reject) => {
    target.addEventListener(event, resolve, { once: true });
    target.addEventListener('error', () => reject(new ClipError("This clip's format can't be played here.")), {
      once: true,
    });
  });
}

// The fallback: plays the clip through a canvas into a MediaRecorder -> a Blob
// (MP4 or WebM) at no more than 720p and the limits' bitrate. Takes as long as
// the clip plays, and the tab has to stay visible meanwhile (hidden tabs stop
// drawing frames).
async function compressVideoByRecording(file, { limits, onProgress }) {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  try {
    await once(video, 'loadedmetadata');
    const duration = video.duration;
    if (!(duration > 0) || !isFinite(duration)) throw new ClipError("Couldn't read how long this clip is.");
    if (duration > limits.maxSeconds + 0.5) {
      throw new ClipError(`Clips can be up to ${limits.maxSeconds} seconds - this one is ${Math.round(duration)}.`);
    }
    const srcW = video.videoWidth;
    const srcH = video.videoHeight;
    if (!srcW || !srcH) throw new ClipError('This file has no picture to show.');
    if (clipIsSmallEnough({ type: file.type, size: file.size, width: srcW, height: srcH, duration }, limits)) {
      onProgress?.(1);
      return file;
    }

    const type = typeof MediaRecorder !== 'undefined' ? pickRecorderType((t) => MediaRecorder.isTypeSupported(t)) : '';
    if (!type || !HTMLCanvasElement.prototype.captureStream) {
      throw new Error("This browser can't shrink video. Try Chrome, Edge or Firefox.");
    }

    const { width, height } = fitWithin(srcW, srcH, limits.maxSide);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const stream = canvas.captureStream(30);

    // Sound goes through an audio graph that ends in the recording, not the
    // speakers, so the clip is silent while it is being processed.
    let audio = null;
    try {
      audio = new AudioContext();
      const source = audio.createMediaElementSource(video);
      const sink = audio.createMediaStreamDestination();
      source.connect(sink);
      sink.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
    } catch {
      audio = null; // A clip without sound, or a browser that won't route it.
    }

    const recorder = new MediaRecorder(stream, {
      mimeType: type,
      videoBitsPerSecond: limits.videoBitsPerSecond,
      audioBitsPerSecond: limits.audioBitsPerSecond,
    });
    const chunks = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise((resolve) => (recorder.onstop = resolve));

    let drawing = true;
    const draw = () => {
      if (!drawing) return;
      ctx.drawImage(video, 0, 0, width, height);
      onProgress?.(Math.min(0.99, video.currentTime / duration));
      if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(draw);
      else requestAnimationFrame(draw);
    };

    if (video.readyState < 2) await once(video, 'loadeddata');
    ctx.drawImage(video, 0, 0, width, height);
    recorder.start(1000);
    if (audio?.state === 'suspended') await audio.resume().catch(() => {});
    try {
      await video.play();
    } catch {
      // Autoplay with sound refused: carry on silent rather than not at all.
      video.muted = true;
      await video.play();
    }
    draw();
    await once(video, 'ended');
    drawing = false;
    recorder.stop();
    await stopped;
    stream.getTracks().forEach((track) => track.stop());
    audio?.close().catch(() => {});

    const blob = new Blob(chunks, { type: baseType(type) });
    onProgress?.(1);
    return blob.size < file.size ? blob : file;
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

// The main path: WebCodecs through Mediabunny -> an MP4 Blob, or the file
// itself when it is already small enough. Throws a plain Error when this
// browser can't do it (no WebCodecs, no H.264 encoder), a ClipError when the
// clip is the problem.
async function compressVideoWithCodecs(file, { limits, onProgress }) {
  if (typeof VideoEncoder === 'undefined') throw new Error('No WebCodecs here.');
  const mb = await import(MEDIABUNNY);
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  let track;
  try {
    track = await input.getPrimaryVideoTrack();
  } catch {
    // Mediabunny can't open it; the <video> element behind the fallback may.
    throw new Error('Not a container Mediabunny reads.');
  }
  if (!track) throw new ClipError('This file has no picture to show.');
  const duration = await input.computeDuration();
  if (duration > limits.maxSeconds + 0.5) {
    throw new ClipError(`Clips can be up to ${limits.maxSeconds} seconds - this one is ${Math.round(duration)}.`);
  }
  const srcW = track.displayWidth;
  const srcH = track.displayHeight;
  if (clipIsSmallEnough({ type: file.type, size: file.size, width: srcW, height: srcH, duration }, limits)) {
    onProgress?.(1);
    return file;
  }

  const { width, height } = fitWithin(srcW, srcH, limits.maxSide);
  if (!(await mb.canEncodeVideo('avc', { width, height }))) throw new Error('No H.264 encoder here.');
  const audioCodec = (await mb.canEncodeAudio('aac')) ? 'aac' : 'opus';

  const convert = async (quality, from, span) => {
    const output = new mb.Output({
      // The index goes at the front, so a player can start before it has
      // the whole file.
      format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }),
      target: new mb.BufferTarget(),
    });
    const conversion = await mb.Conversion.init({
      input: new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS }),
      output,
      video: { width, height, fit: 'contain', codec: 'avc', quality, forceTranscode: true },
      audio: { codec: audioCodec, bitrate: limits.audioBitsPerSecond },
    });
    if (!conversion.isValid) throw new Error('This clip can not be converted here.');
    conversion.onProgress = (p) => onProgress?.(Math.min(0.99, from + p * span));
    await conversion.execute();
    return new Blob([output.target.buffer], { type: 'video/mp4' });
  };

  // Constant quality first: a still screen comes out tiny. A very busy clip
  // has no ceiling that way, so past a few times the bitrate budget it is
  // done again with the bitrate as the limit.
  let blob = await convert(
    new mb.Quality({ quantizer: limits.quantizer, bitrate: limits.videoBitsPerSecond, bitrateMode: 'variable' }),
    0,
    1
  );
  const ceiling = (((limits.videoBitsPerSecond + limits.audioBitsPerSecond) * duration) / 8) * 2;
  if (blob.size > ceiling) {
    blob = await convert(new mb.Quality({ bitrate: limits.videoBitsPerSecond, bitrateMode: 'variable' }), 0.5, 0.5);
  }
  onProgress?.(1);
  return blob.size < file.size ? blob : file;
}

// -> a Blob (MP4, or WebM from the fallback) at no more than 720p, or the file
// itself when it is already small enough. onProgress(0..1) reports how far it
// got. A problem with the clip is reported; a browser that can't do the
// WebCodecs path quietly gets the MediaRecorder one instead.
export async function compressVideo(file, { limits = VIDEO_LIMITS, onProgress } = {}) {
  try {
    return await compressVideoWithCodecs(file, { limits, onProgress });
  } catch (err) {
    if (err instanceof ClipError) throw err;
    onProgress?.(0);
    return compressVideoByRecording(file, { limits, onProgress });
  }
}

// A still for a clip, to show while it loads: a frame from half a second in
// (the very first is often black), at no more than 720 px, as WebP (JPEG
// where the browser can't write WebP). Saved beside the clip as
// <name>.poster.webp - see uploadedPosterFor in js/media.js.
export async function videoPoster(blob, { maxSide = 720, quality = 0.78 } = {}) {
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  try {
    await once(video, 'loadeddata');
    const at = Math.min(0.5, (video.duration || 1) / 2);
    if (at > 0) {
      video.currentTime = at;
      await once(video, 'seeked');
    }
    const { width, height } = fitWithin(video.videoWidth, video.videoHeight, maxSide);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(video, 0, 0, width, height);
    let still = await canvasToBlob(canvas, 'image/webp', quality);
    if (!still || still.type !== 'image/webp') still = await canvasToBlob(canvas, 'image/jpeg', quality);
    if (!still) throw new Error('Could not draw a poster.');
    return still;
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

// Picks the right one for a file: pictures by preset, clips by the limits.
// Anything else is returned untouched.
export async function compressFile(file, { preset = IMAGE_PRESETS.cover, limits = VIDEO_LIMITS, onProgress } = {}) {
  const type = baseType(file.type);
  if (type.startsWith('image/')) return compressImage(file, preset);
  if (type.startsWith('video/')) return compressVideo(file, { limits, onProgress });
  return file;
}

// The compressed result as a File named like the original, with the
// extension of what it now is ("clip.mov" -> "clip.mp4").
export function asFile(blob, original) {
  if (blob === original) return original;
  const ext = extensionFor(blob.type);
  const stem = original.name.replace(/\.[^./]+$/, '') || 'file';
  return new File([blob], ext ? `${stem}.${ext}` : original.name, { type: baseType(blob.type) });
}
