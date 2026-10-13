import { toNodeHandler } from 'better-auth/node';
import express from 'express';
import type { Auth } from './auth/auth.js';
import { requireAuth } from './auth/middleware.js';
import { errorHandler } from './middleware/errors.js';
import { healthRouter } from './routes/health.js';
import { publicResultsRouter, resultsRouter } from './routes/results.js';
import { tournamentsRouter } from './routes/tournaments.js';
import { usersRouter } from './routes/users.js';
import { clientRouter } from './static.js';

interface AppOptions {
  auth: Auth;
  /** Built client to serve (single-container deploys); unset when Caddy serves it. */
  clientDir?: string;
}

export function createApp({ auth, clientDir }: AppOptions) {
  const app = express();

  app.disable('x-powered-by');

  // Outside /api, so it never meets requireAuth; the page itself is public, its data is not
  if (clientDir) {
    app.use(clientRouter(clientDir));
  }

  // Better Auth parses its own request bodies, so it goes before express.json()
  app.all('/api/auth/{*splat}', toNodeHandler(auth));
  // 1 MB: room for an imported tournament file (a 64-pair round robin is about 250 kB)
  app.use(express.json({ limit: '1mb' }));

  // Public routes: keep this list short (see CLAUDE.md, "API access")
  app.use('/api/health', healthRouter);
  app.use('/api/results', publicResultsRouter);

  // Everything below requires a signed-in user
  app.use('/api', requireAuth(auth));
  app.use('/api/users', usersRouter);
  app.use('/api/results', resultsRouter);
  app.use('/api/tournaments', tournamentsRouter);

  app.use(errorHandler);

  return app;
}
