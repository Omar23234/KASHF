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

const MAX_RAW_BYTES = 12 * 1024 * 1024; // 12 MB pre-compression safety cap
const MAX_COMPRESSED_BYTES = 1800 * 1024; // < 1.8 MB (under 2 MB Storage rule)
const MAX_DIMENSION = 384;

const ALLOWED_EXTENSIONS = new Set(['png', 'webp', 'jpg', 'jpeg']);
const ALLOWED_MIMES = new Set<string>(['image/png', 'image/webp', 'image/jpeg']);

export function validateStickerFileMetadata(
  mimeType: string | undefined,
  fileName: string | undefined,
  byteLength?: number
): SupportedStickerMime {
  const normalizedMime = (mimeType ?? '').trim().toLowerCase();
  const ext = (fileName ?? '').split('.').pop()?.trim().toLowerCase() ?? '';

  let resolvedMime: SupportedStickerMime | null = null;
  if (ALLOWED_MIMES.has(normalizedMime)) {
    resolvedMime = normalizedMime as SupportedStickerMime;
  } else if (!normalizedMime && ALLOWED_EXTENSIONS.has(ext)) {
    resolvedMime =
      ext === 'png'
        ? 'image/png'
        : ext === 'webp'
          ? 'image/webp'
          : 'image/jpeg';
  } else if (normalizedMime === 'image/jpg' && ALLOWED_EXTENSIONS.has(ext || 'jpg')) {
    resolvedMime = 'image/jpeg';
  }

  if (!resolvedMime) {
    throw new StickerImageError('UNSUPPORTED_FORMAT', `Unsupported format: ${mimeType || ext || 'unknown'}`);
  }

  if (typeof byteLength === 'number' && byteLength > MAX_RAW_BYTES) {
    throw new StickerImageError('FILE_TOO_LARGE', 'Selected image exceeds 12MB raw limit');
  }

  return resolvedMime;
}

export function extensionForMime(mime: SupportedStickerMime): 'png' | 'webp' | 'jpg' {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

export async function computeHexSha256(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (typeof crypto !== 'undefined' && crypto.subtle?.digest) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', input.slice().buffer);
    const hashBytes = new Uint8Array(hashBuffer);
    return Array.from(hashBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 32);
  }
  // Fallback deterministic FNV-1a 64-bit hex for non-WebCrypto test environments
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    h1 ^= input[i];
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= input[i];
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

export function computeScaledDimensions(
  width: number,
  height: number,
  maxSide: number = MAX_DIMENSION
): { width: number; height: number } {
  if (width <= 0 || height <= 0) {
    return { width: maxSide, height: maxSide };
  }
  if (width <= maxSide && height <= maxSide) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const scale = maxSide / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export interface CompressedStickerResult {
  blob: Blob;
  mimeType: SupportedStickerMime;
  extension: 'png' | 'webp' | 'jpg';
  contentHash: string;
  dataUrl: string; // Used ONLY for Single Phone offline mode; Online mode uploads blob to Storage!
  width: number;
  height: number;
}

function loadImageElement(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new StickerImageError('COMPRESSION_FAILED', 'Failed to decode image'));
    };
    img.src = objectUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mime, quality);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new StickerImageError('COMPRESSION_FAILED'));
      }
    };
    reader.onerror = () => reject(new StickerImageError('COMPRESSION_FAILED'));
    reader.readAsDataURL(blob);
  });
}

export async function compressStickerFile(file: File): Promise<CompressedStickerResult> {
  const sourceMime = validateStickerFileMetadata(file.type, file.name, file.size);

  try {
    const img = await loadImageElement(file);
    const targetSize = computeScaledDimensions(img.naturalWidth || img.width, img.naturalHeight || img.height);
    const canvas = document.createElement('canvas');
    canvas.width = targetSize.width;
    canvas.height = targetSize.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new StickerImageError('COMPRESSION_FAILED', 'Canvas 2D context unavailable');
    }
    ctx.clearRect(0, 0, targetSize.width, targetSize.height);
    ctx.drawImage(img, 0, 0, targetSize.width, targetSize.height);

    // Prefer WebP (preserves transparency & yields smallest payload), fallback to source format
    let outMime: SupportedStickerMime = 'image/webp';
    let outBlob = await canvasToBlob(canvas, 'image/webp', 0.82);

    if (!outBlob || (outBlob.type !== 'image/webp' && sourceMime !== 'image/webp')) {
      outMime = sourceMime;
      outBlob = await canvasToBlob(canvas, sourceMime, sourceMime === 'image/png' ? 0.9 : 0.82);
    }

    // Re-compress harder if still slightly large
    if (outBlob && outBlob.size > MAX_COMPRESSED_BYTES) {
      outBlob = await canvasToBlob(canvas, 'image/webp', 0.6);
      if (outBlob && outBlob.type === 'image/webp') {
        outMime = 'image/webp';
      } else {
        outMime = 'image/jpeg';
        outBlob = await canvasToBlob(canvas, 'image/jpeg', 0.72);
      }
    }

    if (!outBlob || outBlob.size > MAX_COMPRESSED_BYTES) {
      throw new StickerImageError('FILE_TOO_LARGE', 'Compressed sticker exceeds size limit');
    }

    const rawBytes = await outBlob.arrayBuffer();
    const contentHash = await computeHexSha256(rawBytes);
    const dataUrl = await blobToDataUrl(outBlob);

    return {
      blob: outBlob,
      mimeType: outMime,
      extension: extensionForMime(outMime),
      contentHash,
      dataUrl,
      width: targetSize.width,
      height: targetSize.height,
    };
  } catch (err) {
    if (err instanceof StickerImageError) throw err;
    throw new StickerImageError('COMPRESSION_FAILED', err instanceof Error ? err.message : undefined);
  }
}
