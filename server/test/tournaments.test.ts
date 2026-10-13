import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { TournamentModel } from '../src/models/tournament.js';
import { createTestApp, signUp, type TestApp } from './app.js';
import { useTestDatabase } from './db.js';
import { validSetup } from './fixtures.js';

const owner = { name: 'Mario', surname: 'Rossi', email: 'mario@example.com' };
const other = { name: 'Anna', surname: 'Bianchi', email: 'anna@example.com' };

describe('tournaments API', () => {
  useTestDatabase();

  let t: TestApp;
  beforeEach(() => {
    t = createTestApp();
  });

  async function createTournament(overrides: object = {}) {
    const { agent } = await signUp(t, owner);
    const res = await agent.post('/api/tournaments').send({ ...validSetup, ...overrides });
    expect(res.status).toBe(201);
    return { agent, tournament: res.body };
  }

  it('requires authentication', async () => {
    expect((await request(t.app).get('/api/tournaments')).status).toBe(401);
    expect((await request(t.app).post('/api/tournaments').send(validSetup)).status).toBe(401);
  });

  describe('POST /api/tournaments', () => {
    it('creates the tournament with groups, matches and brackets', async () => {
      const { tournament } = await createTournament();

      expect(tournament).toMatchObject({
        id: expect.any(String),
        name: 'Torneo di primavera',
        sport: 'padel',
        summary: { status: 'draft', matchesDone: 0, matchesTotal: 22 },
      });
      expect(tournament._id).toBeUndefined();
      expect(tournament.groups).toHaveLength(4);
      expect(tournament.matches).toHaveLength(22);
      expect(await TournamentModel.countDocuments()).toBe(1);
    });

    it('rejects an impossible setup, explaining why', async () => {
      const { agent } = await signUp(t, owner);

      const res = await agent.post('/api/tournaments').send({
        ...validSetup,
        pairCount: 5,
        structure: { ...validSetup.structure, groupCount: 3 },
      });

      expect(res.status).toBe(400);
      expect(res.body.issues).toEqual([
        { code: 'GROUP_COUNT_RANGE', params: { pairs: 5, max: 2 } },
      ]);
      expect(await TournamentModel.countDocuments()).toBe(0);
    });
  });

  describe('POST /api/tournaments/preview', () => {
    it('shows group sizes and brackets without saving', async () => {
      const { agent } = await signUp(t, owner);

      const res = await agent.post('/api/tournaments/preview').send({
        ...validSetup,
        pairCount: 10,
        structure: { type: 'groups_knockout', groupCount: 3, advanceA: 2 },
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        issues: [],
        preview: {
          groupSizes: [4, 3, 3],
          brackets: [{ id: 'A', entrants: 6, size: 8, byes: 2 }],
          matchesTotal: 6 + 3 + 3 + 5,
        },
      });
      expect(await TournamentModel.countDocuments()).toBe(0);
    });

    it('lists the issues of an impossible setup', async () => {
      const { agent } = await signUp(t, owner);

      const res = await agent.post('/api/tournaments/preview').send({ ...validSetup, name: '' });

      expect(res.body).toEqual({ issues: [{ code: 'NAME_REQUIRED' }], preview: null });
    });
  });

  describe('GET /api/tournaments', () => {
    it("lists only the user's own tournaments, newest date first, without the details", async () => {
      const { agent } = await createTournament({ name: 'Ottobre', date: '2026-10-20' });
      await agent
        .post('/api/tournaments')
        .send({ ...validSetup, name: 'Novembre', date: '2026-11-03' });
      const { agent: otherAgent } = await signUp(t, other);
      await otherAgent.post('/api/tournaments').send({ ...validSetup, name: 'Altro' });

      const res = await agent.get('/api/tournaments');

      expect(res.status).toBe(200);
      expect(res.body.map((x: { name: string }) => x.name)).toEqual(['Novembre', 'Ottobre']);
      expect(res.body[0]).toMatchObject({ summary: { status: 'draft' }, date: '2026-11-03' });
      expect(res.body[0].matches).toBeUndefined();
    });
  });

  describe('GET /api/tournaments/:id', () => {
    it('returns the whole tournament to its owner', async () => {
      const { agent, tournament } = await createTournament();

      const res = await agent.get(`/api/tournaments/${tournament.id}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(tournament);
    });

    it("answers 404 for someone else's tournament or an invalid id", async () => {
      const { tournament } = await createTournament();
      const { agent: otherAgent } = await signUp(t, other);

      expect((await otherAgent.get(`/api/tournaments/${tournament.id}`)).status).toBe(404);
      expect((await otherAgent.get('/api/tournaments/not-an-id')).status).toBe(404);
    });
  });

  describe('DELETE /api/tournaments/:id', () => {
    it('deletes the tournament', async () => {
      const { agent, tournament } = await createTournament();

      expect((await agent.delete(`/api/tournaments/${tournament.id}`)).status).toBe(204);
      expect(await TournamentModel.countDocuments()).toBe(0);
    });

    it("cannot delete someone else's tournament", async () => {
      const { tournament } = await createTournament();
      const { agent: otherAgent } = await signUp(t, other);

      expect((await otherAgent.delete(`/api/tournaments/${tournament.id}`)).status).toBe(404);
      expect(await TournamentModel.countDocuments()).toBe(1);
    });
  });

  describe('POST /api/tournaments/:id/duplicate', () => {
    it('copies setup, pairs and schedule, without results', async () => {
      const { agent, tournament } = await createTournament();
      // Results and schedule as later phases will save them
      await TournamentModel.updateOne(
        { _id: tournament.id },
        {
          $set: {
            'pairs.0.players': ['Rossi', 'Bianchi'],
            'matches.0.scoreA': 6,
            'matches.0.scoreB': 2,
            'matches.0.courtId': 'c2',
            'matches.0.timeSlotId': 't1',
          },
        },
      );

      const res = await agent
        .post(`/api/tournaments/${tournament.id}/duplicate`)
        .send({ name: 'Torneo di primavera (copia)' });

      expect(res.status).toBe(201);
      expect(res.body.id).not.toBe(tournament.id);
      expect(res.body.name).toBe('Torneo di primavera (copia)');
      expect(res.body.pairs[0].players).toEqual(['Rossi', 'Bianchi']);
      expect(res.body.matches[0]).toMatchObject({
        scoreA: null,
        scoreB: null,
        courtId: 'c2',
        timeSlotId: 't1',
      });
      expect(res.body.summary).toEqual(tournament.summary);
    });
  });

  describe('editing (players, groups, draw, matches)', () => {
    const url = (id: string, path: string) => `/api/tournaments/${id}${path}`;

    it('saves player names', async () => {
      const { agent, tournament } = await createTournament();

      const res = await agent
        .patch(url(tournament.id, '/pairs/p1'))
        .send({ players: ['Rossi', 'Bianchi'] });

      expect(res.status).toBe(200);
      expect(res.body.pairs[0].players).toEqual(['Rossi', 'Bianchi']);
      const saved = await TournamentModel.findById(tournament.id);
      expect(saved!.pairs[0].players).toEqual(['Rossi', 'Bianchi']);
    });

    it('saves a score and the recomputed standings and status', async () => {
      const { agent, tournament } = await createTournament();

      const res = await agent
        .patch(url(tournament.id, '/matches/p1-p2'))
        .send({ scoreA: 3, scoreB: 6, courtId: 'c2' });

      expect(res.status).toBe(200);
      const saved = (await TournamentModel.findById(tournament.id))!.toObject();
      expect(saved.matches.find((m) => m.id === 'p1-p2')).toMatchObject({
        scoreA: 3,
        scoreB: 6,
        courtId: 'c2',
        state: 'done',
        winner: 'p2',
      });
      expect(saved.groups[0].standings[0]).toMatchObject({ pairId: 'p2', wins: 1 });
      expect(saved.summary).toMatchObject({ status: 'groups', matchesDone: 1 });
    });

    it('explains a refused change and saves nothing', async () => {
      const { agent, tournament } = await createTournament();

      const res = await agent.patch(url(tournament.id, '/matches/p1-p2')).send({ scoreA: -1 });

      expect(res.status).toBe(400);
      expect(res.body.issues).toEqual([{ code: 'SCORE_INVALID', params: { max: 99 } }]);
      const saved = await TournamentModel.findById(tournament.id);
      expect(saved!.summary.status).toBe('draft');
    });

    it('moves pairs and draws until the first result, then locks the groups', async () => {
      const { agent, tournament } = await createTournament({ pairCount: 13 });
      const groups = tournament.groups.map((g: { id: string; pairIds: string[] }) => ({
        id: g.id,
        pairIds: g.pairIds,
      }));
      groups[0].pairIds = ['p1', 'p2', 'p3'];
      groups[1].pairIds = [...groups[1].pairIds, 'p4'];

      const moved = await agent.put(url(tournament.id, '/groups')).send({ groups });
      expect(moved.status).toBe(200);
      expect(moved.body.groups[1].pairIds).toContain('p4');

      expect((await agent.post(url(tournament.id, '/draw'))).status).toBe(200);

      await agent.patch(url(tournament.id, '/matches/p1-p2')).send({ scoreA: 6 });
      const locked = await agent.post(url(tournament.id, '/draw'));
      expect(locked.status).toBe(400);
      expect(locked.body.issues).toEqual([{ code: 'STRUCTURE_LOCKED' }]);
    });

    it('answers 404 for unknown matches and for other users', async () => {
      const { agent, tournament } = await createTournament();
      const { agent: otherAgent } = await signUp(t, other);

      const unknown = await agent.patch(url(tournament.id, '/matches/nope')).send({});
      const notOwner = await otherAgent
        .patch(url(tournament.id, '/matches/p1-p2'))
        .send({ scoreA: 6 });

      expect(unknown.status).toBe(404);
      expect(notOwner.status).toBe(404);
    });

    it('refuses to overwrite a tournament saved in the meantime', async () => {
      const { agent, tournament } = await createTournament();
      const stale = await TournamentModel.findById(tournament.id);
      await agent.patch(url(tournament.id, '/matches/p1-p2')).send({ scoreA: 6 });

      stale!.name = 'Changed elsewhere';
      await expect(stale!.save()).rejects.toThrow(/No matching document/);
    });
  });
});
