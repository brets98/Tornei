import express from 'express';
import { errorHandler } from './middleware/errors.js';
import { healthRouter } from './routes/health.js';
import { usersRouter } from './routes/users.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json());

  app.use('/api/health', healthRouter);
  app.use('/api/users', usersRouter);

  app.use(errorHandler);

  return app;
}
