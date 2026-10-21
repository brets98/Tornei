import { Router } from 'express';
import mongoose from 'mongoose';

/** `signUp`: whether registration is open, so the sign-in page can offer it. */
export function healthRouter({ signUp }: { signUp: boolean }) {
  const router = Router();

  router.get('/', (_req, res) => {
    const db = mongoose.connection.readyState === mongoose.ConnectionStates.connected;
    res.json({ status: 'ok', db: db ? 'connected' : 'disconnected', signUp });
  });

  return router;
}
