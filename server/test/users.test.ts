import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { UserModel } from '../src/models/user.js';
import { useTestDatabase } from './db.js';

const app = createApp();

describe('POST /api/users', () => {
  useTestDatabase();

  it('creates a user with id and timestamps', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ name: ' Mario ', surname: 'Rossi', email: 'Mario.Rossi@Example.com' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      name: 'Mario',
      surname: 'Rossi',
      email: 'mario.rossi@example.com',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(await UserModel.findById(res.body.id)).not.toBeNull();
  });

  it('rejects missing or invalid fields', async () => {
    const res = await request(app).post('/api/users').send({ name: 'Mario', email: 'nope' });

    expect(res.status).toBe(400);
    expect(Object.keys(res.body.errors).sort()).toEqual(['email', 'surname']);
  });

  it('rejects a duplicate email', async () => {
    const user = { name: 'Mario', surname: 'Rossi', email: 'mario@example.com' };
    await request(app).post('/api/users').send(user);

    const res = await request(app)
      .post('/api/users')
      .send({ ...user, email: 'MARIO@example.com' });

    expect(res.status).toBe(409);
  });

  it('ignores fields that are not part of the user', async () => {
    const res = await request(app).post('/api/users').send({
      name: 'Mario',
      surname: 'Rossi',
      email: 'mario@example.com',
      id: 'hacked',
      createdAt: '2000-01-01T00:00:00.000Z',
    });

    expect(res.status).toBe(201);
    expect(res.body.id).not.toBe('hacked');
    expect(res.body.createdAt).not.toBe('2000-01-01T00:00:00.000Z');
  });
});
