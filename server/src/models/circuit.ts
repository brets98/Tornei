import { model, Schema, type SchemaDefinition, type Types } from 'mongoose';
import { createSchema } from '../db/schema.js';
import type { CircuitData } from '../domain/circuit.js';

/** A series of tournaments with a ranking; its stages point to it (`tournament.circuit`). */
export interface Circuit extends CircuitData {
  ownerId: Types.ObjectId;
}

const embedded = (definition: SchemaDefinition) =>
  new Schema(definition, { _id: false, id: false });

const circuitSchema = createSchema<Circuit>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true, trim: true },
  season: { type: String, default: '', trim: true },
  categories: [
    embedded({
      id: { type: String, required: true },
      name: { type: String, required: true },
      points: embedded({
        places: [Number],
        groups: Number,
        participation: Number,
      }),
    }),
  ],
});

circuitSchema.set('optimisticConcurrency', true);
circuitSchema.index({ ownerId: 1, createdAt: -1 });

export const CircuitModel = model<Circuit>('Circuit', circuitSchema);
