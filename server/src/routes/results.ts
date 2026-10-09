import { Router } from 'express';
import { requireAdmin } from '../auth/middleware.js';
import { ResultModel } from '../models/result.js';

/** Public: the latest published result, without who published it. */
export const publicResultsRouter = Router();

publicResultsRouter.get('/latest', async (_req, res) => {
  const latest = await ResultModel.findOne().sort({ createdAt: -1, _id: -1 });
  res.json(latest && { text: latest.text, publishedAt: latest.get('createdAt') });
});

export const resultsRouter = Router();

resultsRouter.post('/', requireAdmin, async (req, res) => {
  const result = await ResultModel.create({ text: req.body?.text, createdBy: req.user!.id });
  res.status(201).json(result);
});
