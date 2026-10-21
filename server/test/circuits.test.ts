import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { PlayerModel } from '../src/models/player.js';
import { createTestApp, signUp, type TestApp } from './app.js';
import { useTestDatabase } from './db.js';
import { sets, validSetup } from './fixtures.js';

const owner = { name: 'Mario', surname: 'Rossi', email: 'mario@example.com' };
const other = { name: 'Anna', surname: 'Bianchi', email: 'anna@example.com' };

const knockout = { ...validSetup, pairCount: 2, structure: { type: 'knockout' } };

describe('players and circuits API', () => {
  useTestDatabase();

  let t: TestApp;
  beforeEach(() => {
    t = createTestApp();
  });

  it('requires authentication', async () => {
    expect((await request(t.app).get('/api/players')).status).toBe(401);
    expect((await request(t.app).get('/api/circuits')).status).toBe(401);
  });

  describe('players', () => {
    it('adds, lists, renames and removes players, names unique ignoring case', async () => {
      const { agent } = await signUp(t, owner);

      const created = await agent.post('/api/players').send({ name: ' Luca Verdi ' });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ id: expect.any(String), name: 'Luca Verdi' });

      const duplicate = await agent.post('/api/players').send({ name: 'luca verdi' });
      expect(duplicate.status).toBe(400);
      expect(duplicate.body.issues).toEqual([
        { code: 'PLAYER_EXISTS', params: { name: 'luca verdi' } },
      ]);

      const renamed = await agent
        .patch(`/api/players/${created.body.id}`)
        .send({ name: 'Luca Verde' });
      expect(renamed.body.name).toBe('Luca Verde');
      expect((await agent.get('/api/players')).body.map((p: { name: string }) => p.name)).toEqual([
        'Luca Verde',
      ]);

      expect((await agent.delete(`/api/players/${created.body.id}`)).status).toBe(204);
      expect((await agent.get('/api/players')).body).toEqual([]);
    });

    it("hides another user's players", async () => {
      const { agent } = await signUp(t, owner);
      const created = await agent.post('/api/players').send({ name: 'Luca Verdi' });
      const { agent: stranger } = await signUp(t, other);

      expect((await stranger.get('/api/players')).body).toEqual([]);
      expect(
        (await stranger.patch(`/api/players/${created.body.id}`).send({ name: 'X' })).status,
      ).toBe(404);
    });
  });

  describe('circuits', () => {
    async function createCircuit() {
      const { agent } = await signUp(t, owner);
      const res = await agent.post('/api/circuits').send({ name: 'Circuito', season: '2027' });
      expect(res.status).toBe(201);
      return { agent, circuit: res.body };
    }

    it('starts a circuit with the default categories', async () => {
      const { circuit } = await createCircuit();

      expect(circuit.categories.map((c: { name: string }) => c.name)).toEqual([
        'Major',
        'P1',
        'P2',
      ]);
    });

    it('links the players of its stages and ranks them once a stage is finished', async () => {
      const { agent, circuit } = await createCircuit();
      const link = { circuitId: circuit.id, categoryId: 'k2' };

      const created = await agent.post('/api/tournaments').send({ ...knockout, circuit: link });
      expect(created.status).toBe(201);
      const id = created.body.id;
      await agent.patch(`/api/tournaments/${id}/pairs/p1`).send({ players: ['Rossi', 'Bianchi'] });
      const pairs = await agent
        .patch(`/api/tournaments/${id}/pairs/p2`)
        .send({ players: ['Verdi', 'rossi'] });

      // "rossi" is the same player as "Rossi"
      const players = await PlayerModel.find().sort({ key: 1 });
      expect(players.map((p) => p.name)).toEqual(['Bianchi', 'Rossi', 'Verdi']);
      const rossi = players[1].id;
      expect(pairs.body.pairs[0].playerIds).toContain(rossi);
      expect(pairs.body.pairs[1].playerIds).toContain(rossi);

      let detail = await agent.get(`/api/circuits/${circuit.id}`);
      expect(detail.body.stages).toEqual([
        expect.objectContaining({ id, categoryId: 'k2', summary: expect.any(Object) }),
      ]);
      expect(detail.body.ranking).toEqual([]);

      const final = created.body.matches[0].id;
      await agent.patch(`/api/tournaments/${id}/matches/${final}`).send({ sets: sets('6-0 6-0') });
      detail = await agent.get(`/api/circuits/${circuit.id}`);

      expect(
        detail.body.ranking.map((r: { name: string; points: number }) => [r.name, r.points]),
      ).toEqual([
        ['Rossi', 1010 + 610],
        ['Bianchi', 1010],
        ['Verdi', 610],
      ]);
    });

    it('links an existing tournament from its settings, and refuses a wrong category', async () => {
      const { agent, circuit } = await createCircuit();
      const created = await agent.post('/api/tournaments').send(knockout);
      const id = created.body.id;
      await agent.patch(`/api/tournaments/${id}/pairs/p1`).send({ players: ['Rossi', 'Bianchi'] });

      const wrong = await agent
        .patch(`/api/tournaments/${id}/settings`)
        .send({ circuit: { circuitId: circuit.id, categoryId: 'k9' } });
      expect(wrong.status).toBe(400);
      expect(wrong.body.issues).toEqual([{ code: 'CIRCUIT_INVALID' }]);

      const linked = await agent
        .patch(`/api/tournaments/${id}/settings`)
        .send({ circuit: { circuitId: circuit.id, categoryId: 'k1' } });
      expect(linked.status).toBe(200);
      expect(linked.body.circuit).toEqual({ circuitId: circuit.id, categoryId: 'k1' });
      expect(await PlayerModel.countDocuments()).toBe(2);

      const unlinked = await agent.patch(`/api/tournaments/${id}/settings`).send({ circuit: null });
      expect(unlinked.body.circuit).toBeNull();
    });

    it('protects categories and players in use, and circuits with stages', async () => {
      const { agent, circuit } = await createCircuit();
      const created = await agent
        .post('/api/tournaments')
        .send({ ...knockout, circuit: { circuitId: circuit.id, categoryId: 'k2' } });
      const tournament = await agent
        .patch(`/api/tournaments/${created.body.id}/pairs/p1`)
        .send({ players: ['Rossi', 'Bianchi'] });

      const edit = await agent
        .patch(`/api/circuits/${circuit.id}`)
        .send({ categories: circuit.categories.filter((c: { id: string }) => c.id !== 'k2') });
      expect(edit.body.issues).toEqual([{ code: 'CATEGORY_IN_USE', params: { name: 'P1' } }]);

      const player = tournament.body.pairs[0].playerIds[0];
      const removePlayer = await agent.delete(`/api/players/${player}`);
      expect(removePlayer.status).toBe(409);
      expect(removePlayer.body.issues).toEqual([{ code: 'PLAYER_IN_USE', params: { count: 1 } }]);

      const remove = await agent.delete(`/api/circuits/${circuit.id}`);
      expect(remove.status).toBe(409);
      expect(remove.body.issues).toEqual([{ code: 'CIRCUIT_HAS_STAGES', params: { count: 1 } }]);
    });

    it('renames a player in every tournament where they play', async () => {
      const { agent, circuit } = await createCircuit();
      const created = await agent
        .post('/api/tournaments')
        .send({ ...knockout, circuit: { circuitId: circuit.id, categoryId: 'k2' } });
      const id = created.body.id;
      const linked = await agent
        .patch(`/api/tournaments/${id}/pairs/p1`)
        .send({ players: ['Rossi', 'Bianchi'] });

      await agent
        .patch(`/api/players/${linked.body.pairs[0].playerIds[0]}`)
        .send({ name: 'Mario Rossi' });

      const tournament = await agent.get(`/api/tournaments/${id}`);
      expect(tournament.body.pairs[0].players).toEqual(['Mario Rossi', 'Bianchi']);
    });

    it("refuses another user's circuit", async () => {
      const { circuit } = await createCircuit();
      const { agent: stranger } = await signUp(t, other);

      expect((await stranger.get(`/api/circuits/${circuit.id}`)).status).toBe(404);
      const res = await stranger
        .post('/api/tournaments')
        .send({ ...knockout, circuit: { circuitId: circuit.id, categoryId: 'k1' } });
      expect(res.status).toBe(400);
    });
  });

  describe('past stages', () => {
    const past = {
      name: 'Tappa 1',
      date: '2026-06-01',
      categoryId: 'k2',
      entries: [
        { players: ['Rossi', 'Bianchi'], place: 'winner' },
        { players: ['Verdi', 'Neri'], place: 'runnerUp' },
        { players: ['Gialli', 'Blu'], place: 'semifinal' },
      ],
    };

    it('adds a past stage that counts in the ranking, then edits and removes it', async () => {
      const { agent } = await signUp(t, owner);
      const circuit = (await agent.post('/api/circuits').send({ name: 'Circuito' })).body;

      const added = await agent.post(`/api/circuits/${circuit.id}/stages`).send(past);
      expect(added.status).toBe(201);
      expect(added.body.pastStages).toHaveLength(1);
      expect(await PlayerModel.countDocuments()).toBe(6);

      let detail = await agent.get(`/api/circuits/${circuit.id}`);
      expect(detail.body.stages).toEqual([
        {
          id: 'm1',
          name: 'Tappa 1',
          date: '2026-06-01',
          categoryId: 'k2',
          summary: null,
          past: true,
        },
      ]);
      expect(
        detail.body.ranking
          .slice(0, 3)
          .map((r: { name: string; points: number }) => [r.name, r.points]),
      ).toEqual([
        ['Bianchi', 1010],
        ['Rossi', 1010],
        ['Neri', 610],
      ]);

      const rossi = (await PlayerModel.findOne({ key: 'rossi' }))!.id;
      const edited = await agent.put(`/api/circuits/${circuit.id}/stages/m1`).send({
        ...past,
        entries: [
          { ...past.entries[0], place: 'runnerUp' },
          { ...past.entries[1], place: 'winner' },
        ],
      });
      expect(edited.status).toBe(200);
      expect(edited.body.pastStages[0].entries[0].playerIds[0]).toBe(rossi);
      detail = await agent.get(`/api/circuits/${circuit.id}`);
      expect(detail.body.ranking[0].name).toBe('Neri');

      // Players and the category are in use while the stage exists
      expect((await agent.delete(`/api/players/${rossi}`)).status).toBe(409);
      const removeCategory = await agent
        .patch(`/api/circuits/${circuit.id}`)
        .send({ categories: circuit.categories.filter((c: { id: string }) => c.id !== 'k2') });
      expect(removeCategory.status).toBe(400);

      const removed = await agent.delete(`/api/circuits/${circuit.id}/stages/m1`);
      expect(removed.body.pastStages).toEqual([]);
      expect((await agent.delete(`/api/players/${rossi}`)).status).toBe(204);
    });

    it('refuses an invalid past stage, explaining why', async () => {
      const { agent } = await signUp(t, owner);
      const circuit = (await agent.post('/api/circuits').send({ name: 'Circuito' })).body;

      const res = await agent.post(`/api/circuits/${circuit.id}/stages`).send({
        ...past,
        categoryId: 'k9',
        entries: [past.entries[0], { players: ['rossi', ''] }],
      });

      expect(res.status).toBe(400);
      expect(res.body.issues.map((i: { code: string }) => i.code)).toEqual([
        'CATEGORY_UNKNOWN',
        'PLAYERS_INCOMPLETE',
        'STAGE_PLACE_REQUIRED',
        'STAGE_PLAYER_TWICE',
      ]);
      expect((await agent.put(`/api/circuits/${circuit.id}/stages/m9`).send(past)).status).toBe(
        404,
      );
    });
  });
});
