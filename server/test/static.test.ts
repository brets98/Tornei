import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createAuth } from '../src/auth/auth.js';
import { useTestDatabase } from './db.js';

describe('serving the built client', () => {
  useTestDatabase();

  const dir = mkdtempSync(path.join(tmpdir(), 'tornei-client-'));
  mkdirSync(path.join(dir, 'assets'));
  writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>Tornei</title>');
  writeFileSync(path.join(dir, 'assets', 'index-abc123.js'), 'console.log(1)');
  writeFileSync(path.join(dir, 'favicon.svg'), '<svg/>');
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const app = () =>
    createApp({
      auth: createAuth({
        db: mongoose.connection.db!,
        config: { secret: 'test-secret-that-is-at-least-32-characters', baseUrl: 'http://x' },
        mailer: async () => {},
      }),
      clientDir: dir,
    });

  it('answers client routes with index.html, never cached', async () => {
    for (const url of ['/', '/tournaments/abc', '/live/1?view=groups']) {
      const res = await request(app()).get(url);
      expect(res.status).toBe(200);
      expect(res.text).toContain('<title>Tornei</title>');
      expect(res.headers['cache-control']).toBe('no-cache');
    }
  });

  it('serves hashed assets as immutable and other files', async () => {
    const asset = await request(app()).get('/assets/index-abc123.js');
    expect(asset.status).toBe(200);
    expect(asset.headers['cache-control']).toContain('immutable');

    expect((await request(app()).get('/favicon.svg')).status).toBe(200);
    expect((await request(app()).get('/assets/missing.js')).status).toBe(404);
  });

  it('leaves /api alone', async () => {
    expect((await request(app()).get('/api/health')).body.status).toBe('ok');
    expect((await request(app()).get('/api/nothing')).status).toBe(401);
    expect((await request(app()).get('/api')).status).toBe(401);
  });
});
