import { EventEmitter } from 'node:events';
import { Router } from 'express';
import { requireAdmin } from '../auth/middleware.js';
import { ResultModel, type Result } from '../models/result.js';

/** What the public sees of a result: never who published it. */
export interface PublicResult {
  text: string;
  publishedAt: Date;
}

function toPublic(result: (Result & { createdAt?: Date }) | null): PublicResult | null {
  return result && { text: result.text, publishedAt: result.createdAt! };
}

async function findLatest() {
  return toPublic(await ResultModel.findOne().sort({ createdAt: -1, _id: -1 }).lean());
}

/**
 * Notifies open streams when a result is published. In-process only: fine for one
 * server instance; several instances would need a shared channel (e.g. MongoDB change streams).
 */
export const resultEvents = new EventEmitter().setMaxListeners(0);

const HEARTBEAT_MS = 25_000;

/** Public: the latest published result. */
export const publicResultsRouter = Router();

publicResultsRouter.get('/latest', async (_req, res) => {
  res.json(await findLatest());
});

/** Public: Server-Sent Events stream; sends the latest result now and every new one as it is published. */
publicResultsRouter.get('/stream', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Never send a result older than one already sent (a publish can race the initial lookup)
  let sentAt: number | undefined;
  const send = (result: PublicResult | null) => {
    const at = result ? new Date(result.publishedAt).getTime() : 0;
    if (res.destroyed || (sentAt !== undefined && at < sentAt)) return;
    sentAt = at;
    res.write(`data: ${JSON.stringify(result)}\n\n`);
  };
  resultEvents.on('published', send);
  // Comment lines keep proxies and browsers from closing an idle connection
  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);

  req.on('close', () => {
    clearInterval(heartbeat);
    resultEvents.off('published', send);
  });

  send(await findLatest());
});

export const resultsRouter = Router();

resultsRouter.post('/', requireAdmin, async (req, res) => {
  const result = await ResultModel.create({ text: req.body?.text, createdBy: req.user!.id });
  resultEvents.emit('published', toPublic(result.toObject()));
  res.status(201).json(result);
});
