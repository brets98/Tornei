import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resultEvents } from '../src/routes/results.js';
import { createTestApp, signUp, type TestApp } from './app.js';
import { useTestDatabase } from './db.js';

const admin = { name: 'Mario', surname: 'Rossi', email: 'mario@example.com' };

/** Opens the SSE stream on a real server and yields each `data:` payload as parsed JSON. */
async function openStream(server: Server) {
  const { port } = server.address() as AddressInfo;
  const controller = new AbortController();
  const res = await fetch(`http://127.0.0.1:${port}/api/results/stream`, {
    signal: controller.signal,
  });
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';

  async function next(): Promise<unknown> {
    for (;;) {
      const end = buffer.indexOf('\n\n');
      if (end !== -1) {
        const event = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = event.split('\n').find((line) => line.startsWith('data: '));
        if (data) return JSON.parse(data.slice('data: '.length));
        continue;
      }
      const { value, done } = await reader.read();
      if (done) throw new Error('Stream closed');
      buffer += value;
    }
  }

  return { res, next, close: () => controller.abort() };
}

describe('GET /api/results/stream (public)', () => {
  useTestDatabase();

  let t: TestApp;
  let server: Server;
  beforeEach(async () => {
    t = createTestApp();
    server = await new Promise<Server>((resolve) => {
      const s = t.app.listen(0, () => resolve(s));
    });
  });
  afterEach(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  it('is an event stream that starts with the current result', async () => {
    const stream = await openStream(server);

    expect(stream.res.status).toBe(200);
    expect(stream.res.headers.get('content-type')).toBe('text/event-stream');
    expect(await stream.next()).toBeNull();
    stream.close();
  });

  it('pushes each new result as soon as it is published, without who published it', async () => {
    const { agent } = await signUp(t, admin, { role: 'admin' });
    const stream = await openStream(server);
    expect(await stream.next()).toBeNull();

    await agent.post('/api/results').send({ text: 'Team A 1 - 0 Team B' });
    expect(await stream.next()).toEqual({
      text: 'Team A 1 - 0 Team B',
      publishedAt: expect.any(String),
    });

    await agent.post('/api/results').send({ text: 'Team A 2 - 0 Team B' });
    expect(await stream.next()).toMatchObject({ text: 'Team A 2 - 0 Team B' });
    stream.close();
  });

  it('stops listening when the client disconnects', async () => {
    const stream = await openStream(server);
    await stream.next();
    expect(resultEvents.listenerCount('published')).toBe(1);

    stream.close();

    await expect.poll(() => resultEvents.listenerCount('published')).toBe(0);
  });
});
