import * as Crypto from 'expo-crypto';
import * as ImageManipulator from 'expo-image-manipulator';

export type SupportedStickerMime = 'image/png' | 'image/webp' | 'image/jpeg';

export type StickerValidationErrorCode =
  | 'UNSUPPORTED_FORMAT'
  | 'FILE_TOO_LARGE'
  | 'COMPRESSION_FAILED';

export class StickerImageError extends Error {
  readonly code: StickerValidationErrorCode;

  constructor(code: StickerValidationErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'StickerImageError';
    this.code = code;
  }
}

const ALLOWED_EXTENSIONS = new Set(['png', 'webp', 'jpg', 'jpeg']);
const ALLOWED_MIMES = new Set<string>(['image/png', 'image/webp', 'image/jpeg']);
const MAX_DIMENSION = 384;

export function validateStickerFormat(
  mimeType?: string | null,
  fileName?: string | null,
  fileSize?: number | null
): SupportedStickerMime {
  const normalizedMime = (mimeType ?? '').trim().toLowerCase();
  const cleanName = (fileName ?? '').split('?')[0];
  const ext = cleanName.split('.').pop()?.trim().toLowerCase() ?? '';

  let resolved: SupportedStickerMime | null = null;
  if (ALLOWED_MIMES.has(normalizedMime)) {
    resolved = normalizedMime as SupportedStickerMime;
  } else if (normalizedMime === 'image/jpg') {
    resolved = 'image/jpeg';
  } else if (!normalizedMime && ALLOWED_EXTENSIONS.has(ext)) {
    resolved =
      ext === 'png'
        ? 'image/png'
        : ext === 'webp'
          ? 'image/webp'
          : 'image/jpeg';
  }

  if (!resolved) {
    throw new StickerImageError('UNSUPPORTED_FORMAT', `Unsupported format: ${mimeType || ext || 'unknown'}`);
  }

  if (typeof fileSize === 'number' && fileSize > 12 * 1024 * 1024) {
    throw new StickerImageError('FILE_TOO_LARGE', 'Selected image exceeds 12MB raw limit');
  }

  return resolved;
}

export interface MobileCompressedSticker {
  uri: string;
  dataUrl: string;
  mimeType: SupportedStickerMime;
  extension: 'png' | 'webp' | 'jpg';
  contentHash: string;
  width: number;
  height: number;
}

export async function compressMobileStickerAsset(asset: {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  width?: number;
  height?: number;
}): Promise<MobileCompressedSticker> {
  const sourceMime = validateStickerFormat(
    asset.mimeType,
    asset.fileName || asset.uri,
    asset.fileSize
  );

  try {
    const srcW = asset.width ?? MAX_DIMENSION;
    const srcH = asset.height ?? MAX_DIMENSION;
    const resizeAction =
      srcW >= srcH
        ? { resize: { width: Math.min(MAX_DIMENSION, srcW) } }
        : { resize: { height: Math.min(MAX_DIMENSION, srcH) } };

    // Use PNG for PNG assets to keep transparency, WEBP for WebP, JPEG for JPEG
    const format =
      sourceMime === 'image/png'
        ? ImageManipulator.SaveFormat.PNG
        : sourceMime === 'image/webp'
          ? ImageManipulator.SaveFormat.WEBP
          : ImageManipulator.SaveFormat.JPEG;

    const outMime: SupportedStickerMime =
      format === ImageManipulator.SaveFormat.PNG
        ? 'image/png'
        : format === ImageManipulator.SaveFormat.WEBP
          ? 'image/webp'
          : 'image/jpeg';

    const extension: 'png' | 'webp' | 'jpg' =
      outMime === 'image/png' ? 'png' : outMime === 'image/webp' ? 'webp' : 'jpg';

    const manipulated = await ImageManipulator.manipulateAsync(
      asset.uri,
      srcW > MAX_DIMENSION || srcH > MAX_DIMENSION ? [resizeAction] : [],
      {
        compress: outMime === 'image/png' ? 0.85 : 0.78,
        format,
        base64: true,
      }
    );

    const base64 = manipulated.base64 ?? '';
    if (!base64) {
      throw new StickerImageError('COMPRESSION_FAILED', 'Missing compressed image data');
    }

    const digest = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      base64
    );
    const contentHash = digest.slice(0, 32);
    const dataUrl = `data:${outMime};base64,${base64}`;

    return {
      uri: manipulated.uri,
      dataUrl,
      mimeType: outMime,
      extension,
      contentHash,
      width: manipulated.width,
      height: manipulated.height,
    };
  } catch (err) {
    if (err instanceof StickerImageError) throw err;
    throw new StickerImageError('COMPRESSION_FAILED', err instanceof Error ? err.message : undefined);
  }
}
