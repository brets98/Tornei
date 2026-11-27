import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { ImageModel } from '../src/models/image.js';
import { createTestApp, signUp, type TestApp } from './app.js';
import { useTestDatabase } from './db.js';
import { validSetup } from './fixtures.js';

/** The smallest valid PNG header, enough to be recognized as one. */
const PNG = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(32, 1)]);
const WEBP = Buffer.concat([Buffer.from('RIFF\0\0\0\0WEBP', 'latin1'), Buffer.alloc(32, 2)]);

describe('tournament images', () => {
  useTestDatabase();

  let t: TestApp;
  beforeEach(() => {
    t = createTestApp();
  });

  async function setup() {
    const { agent } = await signUp(t, {
      name: 'Mario',
      surname: 'Rossi',
      email: 'mario@example.com',
    });
    const created = await agent.post('/api/tournaments').send(validSetup);
    const url = `/api/tournaments/${created.body.id}`;
    return { agent, id: created.body.id as string, url };
  }

  it('uploads, replaces and removes the logo and the background', async () => {
    const { agent, url } = await setup();

    const logo = await agent.put(`${url}/images/logo`).set('Content-Type', 'image/png').send(PNG);
    expect(logo.status).toBe(200);
    expect(logo.body.images).toEqual({ logo: expect.any(String), background: null });

    const file = await agent.get(`/api/images/${logo.body.images.logo}`);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('image/png');
    expect(Buffer.from(file.body)).toEqual(PNG);

    // The content type comes from the file itself, not from what the client says
    const replaced = await agent
      .put(`${url}/images/logo`)
      .set('Content-Type', 'image/png')
      .send(WEBP);
    expect(replaced.body.images.logo).not.toBe(logo.body.images.logo);
    expect(
      (await agent.get(`/api/images/${replaced.body.images.logo}`)).headers['content-type'],
    ).toBe('image/webp');
    expect((await agent.get(`/api/images/${logo.body.images.logo}`)).status).toBe(404);

    const background = await agent
      .put(`${url}/images/background`)
      .set('Content-Type', 'image/png')
      .send(PNG);
    expect(background.body.images.background).toEqual(expect.any(String));

    const removed = await agent.delete(`${url}/images/logo`);
    expect(removed.body.images.logo).toBeNull();
    expect(await ImageModel.countDocuments()).toBe(1);
  });

  it('refuses files that are not images, and unknown kinds', async () => {
    const { agent, url } = await setup();
    const svg = await agent
      .put(`${url}/images/logo`)
      .set('Content-Type', 'image/svg+xml')
      .send(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'));
    expect(svg.status).toBe(400);
    expect(svg.body.issues).toEqual([{ code: 'IMAGE_INVALID' }]);
    const kind = await agent.put(`${url}/images/banner`).set('Content-Type', 'image/png').send(PNG);
    expect(kind.status).toBe(404);
    const large = await agent
      .put(`${url}/images/logo`)
      .set('Content-Type', 'image/png')
      .send(Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024)]));
    expect(large.status).toBe(413);
    expect(await ImageModel.countDocuments()).toBe(0);
  });

  it('shows images only to their owner', async () => {
    const { agent, url } = await setup();
    const logo = await agent.put(`${url}/images/logo`).set('Content-Type', 'image/png').send(PNG);
    const path = `/api/images/${logo.body.images.logo}`;

    expect((await request(t.app).get(path)).status).toBe(401);
    const { agent: other } = await signUp(t, {
      name: 'Anna',
      surname: 'Bianchi',
      email: 'anna@example.com',
    });
    expect((await other.get(path)).status).toBe(404);
  });

  it('copies the images with the tournament, and deletes them with it', async () => {
    const { agent, url } = await setup();
    await agent.put(`${url}/images/logo`).set('Content-Type', 'image/png').send(PNG);

    const copy = await agent.post(`${url}/duplicate`).send({ name: 'Copia' });
    expect(copy.body.images.logo).toEqual(expect.any(String));
    expect(await ImageModel.countDocuments()).toBe(2);

    await agent.delete(url);
    expect(await ImageModel.countDocuments()).toBe(1);
    expect((await agent.get(`/api/images/${copy.body.images.logo}`)).status).toBe(200);
  });
});
