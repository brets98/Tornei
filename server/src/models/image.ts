import { model, Schema, type Types } from 'mongoose';
import { createSchema } from '../db/schema.js';

/**
 * An image uploaded by a user (a tournament's logo or background), stored in MongoDB so it is
 * in the backups with everything else. Only its owner can read it (`GET /api/images/:id`).
 * The client shrinks images before uploading them, so they stay small.
 */
export interface Image {
  ownerId: Types.ObjectId;
  contentType: string;
  data: Buffer;
}

/** Largest image accepted: the client sends them already shrunk to a few hundred kB. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** The formats accepted, each with the bytes its files start with. No SVG: it can hold scripts. */
const SIGNATURES: Record<string, (data: Buffer) => boolean> = {
  'image/png': (d) => d.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  'image/jpeg': (d) => d[0] === 0xff && d[1] === 0xd8 && d[2] === 0xff,
  'image/webp': (d) =>
    d.subarray(0, 4).toString('latin1') === 'RIFF' &&
    d.subarray(8, 12).toString('latin1') === 'WEBP',
};

export const IMAGE_TYPES = Object.keys(SIGNATURES);

/** The image's real format, from its first bytes; null if it isn't one we accept. */
export function imageType(data: Buffer): string | null {
  return IMAGE_TYPES.find((type) => SIGNATURES[type](data)) ?? null;
}

const imageSchema = createSchema<Image>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  contentType: { type: String, enum: IMAGE_TYPES, required: true },
  data: { type: Buffer, required: true },
});

export const ImageModel = model<Image>('Image', imageSchema);
