import path from 'node:path';
import express, { Router } from 'express';

/**
 * Serves the built client (Vite `dist`) from the API server, for single-container
 * deploys (Cloud Run). The Docker Compose production stack uses Caddy for this instead.
 * Any GET outside /api that is not a file gets index.html, so client routes work on reload.
 */
export function clientRouter(clientDir: string) {
  const router = Router();
  const index = path.join(path.resolve(clientDir), 'index.html');

  // The API is not ours: skip the rest of this router
  router.use('/api', (_req, _res, next) => next('router'));

  // Vite puts content-hashed files in /assets: they never change, cache them for a year
  router.use(
    '/assets',
    express.static(path.join(clientDir, 'assets'), { immutable: true, maxAge: '1y' }),
    (_req, res) => {
      res.sendStatus(404);
    },
  );
  router.use(express.static(clientDir, { index: false, maxAge: '1h' }));

  router.get('/{*splat}', (_req, res) => {
    // Always revalidate the page, so a new deploy is picked up at once
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(index);
  });

  return router;
}
