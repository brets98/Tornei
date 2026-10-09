import { model } from 'mongoose';
import { createSchema } from '../db/schema.js';

export interface User {
  name: string;
  surname: string;
  email: string;
}

const userSchema = createSchema<User>({
  name: { type: String, required: true, trim: true },
  surname: { type: String, required: true, trim: true },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    unique: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'is not a valid email'],
  },
});

export const UserModel = model<User>('User', userSchema);
