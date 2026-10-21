import { model, Schema, type SchemaDefinition, type Types } from 'mongoose';
import { createSchema } from '../db/schema.js';
import { PLACES, type CircuitData, type PastStage } from '../domain/circuit.js';

/** A series of tournaments with a ranking; its stages point to it (`tournament.circuit`). */
export interface Circuit extends CircuitData {
  ownerId: Types.ObjectId;
  pastStages: PastStage[];
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
  pastStages: [
    embedded({
      id: { type: String, required: true },
      name: { type: String, required: true },
      date: { type: String, required: true },
      categoryId: { type: String, required: true },
      entries: [
        embedded({
          players: [String],
          playerIds: [String],
          place: { type: String, enum: [...PLACES, 'groups'], required: true },
        }),
      ],
    }),
  ],
});

circuitSchema.set('optimisticConcurrency', true);
circuitSchema.index({ ownerId: 1, createdAt: -1 });

export const CircuitModel = model<Circuit>('Circuit', circuitSchema);
