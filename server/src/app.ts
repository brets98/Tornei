import { toNodeHandler } from 'better-auth/node';
import express from 'express';
import type { Auth } from './auth/auth.js';
import { requireAuth } from './auth/middleware.js';
import { errorHandler } from './middleware/errors.js';
import { healthRouter } from './routes/health.js';
import { publicResultsRouter, resultsRouter } from './routes/results.js';
import { usersRouter } from './routes/users.js';

export function createApp({ auth }: { auth: Auth }) {
  const app = express();

  app.disable('x-powered-by');

  // Better Auth parses its own request bodies, so it goes before express.json()
  app.all('/api/auth/{*splat}', toNodeHandler(auth));
  app.use(express.json());

  // Public routes: keep this list short (see CLAUDE.md, "API access")
  app.use('/api/health', healthRouter);
  app.use('/api/results', publicResultsRouter);

  // Everything below requires a signed-in user
  app.use('/api', requireAuth(auth));
  app.use('/api/users', usersRouter);
  app.use('/api/results', resultsRouter);

  app.use(errorHandler);

  return app;
}
