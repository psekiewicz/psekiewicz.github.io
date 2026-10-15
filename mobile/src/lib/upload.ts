import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Video } from 'react-native-compressor';

import { supabase } from './supabase';

// Pictures and demo clips from the phone, compressed here before they are
// uploaded - the native side of js/compress.js and js/uploads-data.js, with
// the same sizes and limits, into the same `uploads` bucket (schema.sql).
// What comes back is the file's public URL, which goes into the same field a
// pasted link would.
//
// Pictures are redrawn at no more than the size they are shown at and saved
// as WebP, which also drops the camera's metadata (location included). Clips
// are re-encoded to H.264 MP4 at no more than 720p and a modest bitrate by the
// phone's own hardware encoder (react-native-compressor) - the quick first
// pass; the weekly ffmpeg job (.github/workflows/media-optimize.yml) encodes
// every clip once more, properly. The original is kept whenever it is already
// as small as the result.

export type UploadKind = 'avatar' | 'cover' | 'scroll' | 'inline' | 'media';

// The longest side each picture field is shown at, on the biggest screen.
const IMAGE_MAX_SIDE: Record<UploadKind, number> = {
  avatar: 512,
  cover: 1600,
  scroll: 1920,
  inline: 1600,
  media: 1920,
};
const IMAGE_QUALITY = 0.82;

export const VIDEO_LIMITS = { maxSide: 1280, bitrate: 1_500_000, maxSeconds: 60 };
const GIF_MAX_BYTES = 8 * 1024 * 1024;
// The bucket's own ceiling (schema.sql); compression keeps files far under it.
const UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

const EXTENSION: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

export function fitWithin(width: number, height: number, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2);
  return scale === 1 ? { width, height } : { width: even(width), height: even(height) };
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

type Stage = (stage: 'compress' | 'upload', progress?: number) => void;
type Prepared = { bytes: ArrayBuffer; type: string };

const readBytes = async (uri: string) => (await fetch(uri)).arrayBuffer();

async function preparePicture(asset: ImagePicker.ImagePickerAsset, kind: UploadKind): Promise<Prepared> {
  const original = (asset.mimeType || '').toLowerCase();
  if (original === 'image/gif') {
    // Redrawing a GIF would stop it moving, so it goes up as it is.
    const bytes = await readBytes(asset.uri);
    if (bytes.byteLength > GIF_MAX_BYTES) {
      throw new Error(`GIFs go up as they are, so they have to be under ${formatBytes(GIF_MAX_BYTES)}.`);
    }
    return { bytes, type: 'image/gif' };
  }
  const { width, height } = fitWithin(asset.width, asset.height, IMAGE_MAX_SIDE[kind]);
  const context = ImageManipulator.manipulate(asset.uri);
  if (width !== asset.width || height !== asset.height) context.resize({ width, height });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: IMAGE_QUALITY, format: SaveFormat.WEBP });
  const bytes = await readBytes(saved.uri);

  const keepable = ['image/jpeg', 'image/png', 'image/webp'].includes(original);
  if (keepable && width === asset.width && asset.fileSize && asset.fileSize <= bytes.byteLength) {
    return { bytes: await readBytes(asset.uri), type: original };
  }
  return { bytes, type: 'image/webp' };
}

async function prepareClip(asset: ImagePicker.ImagePickerAsset, onStage?: Stage): Promise<Prepared> {
  // The picker reports duration in milliseconds.
  const seconds = (asset.duration || 0) / 1000;
  if (seconds > VIDEO_LIMITS.maxSeconds + 0.5) {
    throw new Error(`Clips can be up to ${VIDEO_LIMITS.maxSeconds} seconds - this one is ${Math.round(seconds)}.`);
  }
  const uri = await Video.compress(
    asset.uri,
    {
      compressionMethod: 'manual',
      maxSize: VIDEO_LIMITS.maxSide,
      bitrate: VIDEO_LIMITS.bitrate,
      minimumFileSizeForCompress: 0,
      progressDivider: 5,
    },
    (progress) => onStage?.('compress', progress)
  );
  const bytes = await readBytes(uri);
  const original = (asset.mimeType || '').toLowerCase();
  const fits = Math.max(asset.width, asset.height) <= VIDEO_LIMITS.maxSide;
  if (['video/mp4', 'video/webm'].includes(original) && fits && asset.fileSize && asset.fileSize <= bytes.byteLength) {
    return { bytes: await readBytes(asset.uri), type: original };
  }
  return { bytes, type: 'video/mp4' };
}

export type UploadResult = { url: string; size: number; originalSize: number };

// Opens the phone's picker and uploads what was chosen. Resolves with null if
// the person backed out. kind 'media' also offers videos; every other kind is
// a picture.
export async function pickAndUpload(kind: UploadKind, onStage?: Stage): Promise<UploadResult | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Log in to upload.');

  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: kind === 'media' ? ['images', 'videos'] : ['images'],
    allowsMultipleSelection: false,
    exif: false,
  });
  if (picked.canceled || !picked.assets?.length) return null;
  const asset = picked.assets[0];

  onStage?.('compress', 0);
  const { bytes, type } =
    asset.type === 'video' ? await prepareClip(asset, onStage) : await preparePicture(asset, kind);
  if (bytes.byteLength > UPLOAD_MAX_BYTES) throw new Error('Even compressed, this is too big to upload.');

  onStage?.('upload');
  const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${EXTENSION[type]}`;
  const { error } = await supabase.storage.from('uploads').upload(path, bytes, {
    contentType: type,
    // Pictures are final and cached for good; a clip is replaced in place by
    // the weekly ffmpeg pass, so it is cached for a day until then (the same
    // rule as js/uploads-data.js).
    cacheControl: type.startsWith('video/') ? '86400' : '31536000',
  });
  if (error) {
    throw new Error(
      /row-level security/i.test(error.message)
        ? 'Upload refused - you may have reached the limit of 300 files.'
        : error.message
    );
  }
  const url = supabase.storage.from('uploads').getPublicUrl(path).data.publicUrl;
  return { url, size: bytes.byteLength, originalSize: asset.fileSize || bytes.byteLength };
}
