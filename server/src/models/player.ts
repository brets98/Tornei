import { model, Schema, type Types } from 'mongoose';
import { createSchema } from '../db/schema.js';

/**
 * A player in the owner's registry: circuit stages link their names here, so the ranking
 * adds up the same person across tournaments. Names are unique per owner, ignoring case.
 */
export interface Player {
  ownerId: Types.ObjectId;
  name: string;
  /** `name` lowercased: the unique key */
  key: string;
}

export const PLAYER_NAME_LENGTH = 60;

export const playerKey = (name: string) => name.trim().toLowerCase();

const playerSchema = createSchema<Player>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true, trim: true },
  key: { type: String, required: true },
});

playerSchema.index({ ownerId: 1, key: 1 }, { unique: true });

export const PlayerModel = model<Player>('Player', playerSchema);
