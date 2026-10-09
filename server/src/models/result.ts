import { model, Schema, type Types } from 'mongoose';
import { createSchema } from '../db/schema.js';

export const RESULT_MAX_LENGTH = 2000;

/** A score published by an admin. Every publish is a new document; the latest one is shown. */
export interface Result {
  text: string;
  createdBy: Types.ObjectId;
}

const resultSchema = createSchema<Result>({
  text: { type: String, required: true, trim: true, maxlength: RESULT_MAX_LENGTH },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
});

resultSchema.index({ createdAt: -1, _id: -1 });

export const ResultModel = model<Result>('Result', resultSchema);
