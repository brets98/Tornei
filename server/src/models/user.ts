import { model } from 'mongoose';
import { createSchema } from '../db/schema.js';

/**
 * Read model for the `users` collection. Users are created and updated by
 * Better Auth (sign-up, Google login), whose fields this schema mirrors.
 */
export interface User {
  name: string;
  surname: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  role: 'user' | 'admin';
}

const userSchema = createSchema<User>({
  name: { type: String, required: true, trim: true },
  surname: { type: String, default: '', trim: true },
  email: { type: String, required: true, trim: true, lowercase: true, unique: true },
  emailVerified: { type: Boolean, default: false },
  image: { type: String },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
});

export const UserModel = model<User>('User', userSchema);
