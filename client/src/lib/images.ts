import type { CSSProperties } from 'react';
import type { Tournament } from './tournaments';

/** A tournament's images: a logo beside its name, a background behind groups and brackets. */
export type ImageKind = 'logo' | 'background';
export const IMAGE_KINDS: ImageKind[] = ['logo', 'background'];

export const imageUrl = (id: string) => `/api/images/${id}`;

/** Longest side of each kind once shrunk: a logo is small, a background fills a screen. */
const MAX_SIDE: Record<ImageKind, number> = { logo: 600, background: 1600 };
/** A file already this small (and not larger than MAX_SIDE) is sent as it is. */
const SMALL_FILE = 300 * 1024;
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];
export const IMAGE_ACCEPT = ACCEPTED.join(',');

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, 0.85));
}

/**
 * The image ready to upload: shrunk to fit MAX_SIDE, as WebP where the browser can write it
 * (else PNG for a logo, which may be transparent, and JPEG for a background). Throws if the
 * file can't be read as an image.
 */
export async function prepareImage(file: File, kind: ImageKind): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE[kind] / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= SMALL_FILE && ACCEPTED.includes(file.type)) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const webp = await toBlob(canvas, 'image/webp');
  if (webp?.type === 'image/webp') return webp;
  const other = await toBlob(canvas, kind === 'logo' ? 'image/png' : 'image/jpeg');
  if (!other) throw new Error('Image could not be encoded');
  return other;
}

/**
 * Props that put the tournament's background, faded, behind a box (each group, each bracket);
 * none when it has no background.
 */
export function watermark(
  tournament: Pick<Tournament, 'images'>,
): { className: string; style: CSSProperties } | null {
  const id = tournament.images?.background;
  if (!id) return null;
  return {
    className: 'watermarked',
    style: { '--watermark': `url("${imageUrl(id)}")` } as CSSProperties,
  };
}
