import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { ResultModel } from '../src/models/result.js';
import { createTestApp, signUp, type TestApp } from './app.js';
import { useTestDatabase } from './db.js';

const admin = { name: 'Mario', surname: 'Rossi', email: 'mario@example.com' };
const user = { name: 'Anna', surname: 'Bianchi', email: 'anna@example.com' };

describe('results API', () => {
  useTestDatabase();

  let t: TestApp;
  beforeEach(() => {
    t = createTestApp();
  });

  describe('GET /api/results/latest (public)', () => {
    it('returns null when nothing has been published', async () => {
      const res = await request(t.app).get('/api/results/latest');

      expect(res.status).toBe(200);
      expect(res.body).toBeNull();
    });

    it('returns the most recent result without revealing who published it', async () => {
      const { agent } = await signUp(t, admin, { role: 'admin' });
      await agent.post('/api/results').send({ text: 'Team A 1 - 0 Team B' });
      await agent.post('/api/results').send({ text: 'Team A 2 - 1 Team B' });

      const res = await request(t.app).get('/api/results/latest');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ text: 'Team A 2 - 1 Team B', publishedAt: expect.any(String) });
    });
  });

  describe('POST /api/results', () => {
    it('requires authentication', async () => {
      const res = await request(t.app).post('/api/results').send({ text: '1 - 0' });

      expect(res.status).toBe(401);
    });

    it('is forbidden for regular users', async () => {
      const { agent } = await signUp(t, user);

      const res = await agent.post('/api/results').send({ text: '1 - 0' });

      expect(res.status).toBe(403);
      expect(await ResultModel.countDocuments()).toBe(0);
    });

    it('lets admins publish a result, keeping who published it', async () => {
      const { agent, id } = await signUp(t, admin, { role: 'admin' });

      const res = await agent.post('/api/results').send({ text: '  Team A 1 - 0 Team B  ' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        id: expect.any(String),
        text: 'Team A 1 - 0 Team B',
        createdBy: id,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });

    it('rejects empty or too long text', async () => {
      const { agent } = await signUp(t, admin, { role: 'admin' });

      expect((await agent.post('/api/results').send({ text: '   ' })).status).toBe(400);
      expect((await agent.post('/api/results').send({})).status).toBe(400);
      expect((await agent.post('/api/results').send({ text: 'x'.repeat(2001) })).status).toBe(400);
    });
  });
});
