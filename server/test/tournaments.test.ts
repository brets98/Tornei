import { Types } from 'mongoose';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { TournamentModel } from '../src/models/tournament.js';
import { createTestApp, signUp, type TestApp } from './app.js';
import { useTestDatabase } from './db.js';
import { sets, validSetup } from './fixtures.js';

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

    it('creates a consolation draw from the list of pairs, then redraws it by level', async () => {
      const players = Array.from({ length: 6 }, (_, i) => [`Rossi ${i + 1}`, `Bianchi ${i + 1}`]);
      const { agent, tournament } = await createTournament({
        structure: { type: 'knockout_consolation' },
        players,
      });

      expect(tournament.pairs.map((p: { players: string[] }) => p.players)).toEqual(players);
      expect(tournament.brackets.map((b: { id: string }) => b.id)).toEqual(['A', 'C']);
      // Saved and read back with the consolation sources
      const saved = await agent.get(`/api/tournaments/${tournament.id}`);
      expect(saved.body.matches.find((m: { id: string }) => m.id === 'C0-0').sourceA).toEqual({
        kind: 'firstLoser',
        matchId: 'A0-0',
      });

      const leveled = await agent
        .patch(`/api/tournaments/${tournament.id}/pairs/p4`)
        .send({ level: 1 });
      expect(leveled.status).toBe(200);
      expect(leveled.body.pairs[3]).toEqual({ id: 'p4', players: players[3], level: 1 });

      const drawn = await agent.post(`/api/tournaments/${tournament.id}/draw`);
      expect(drawn.status).toBe(200);
      expect(drawn.body.seeding[0]).toBe('p4');

      const emptied = await agent.post(`/api/tournaments/${tournament.id}/brackets/C/reset`);
      expect(emptied.status).toBe(200);
      const missing = await agent.post(`/api/tournaments/${tournament.id}/brackets/B/reset`);
      expect(missing.status).toBe(404);
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

    it('reads tournaments saved before conflicts were computed', async () => {
      const { agent, tournament } = await createTournament();
      await TournamentModel.collection.updateOne(
        { _id: new Types.ObjectId(tournament.id as string) },
        { $unset: { conflicts: '' } },
      );

      const res = await agent.get(`/api/tournaments/${tournament.id}`);

      expect(res.body.conflicts).toEqual([]);
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
            'matches.0.sets': sets('6-2 6-2'),
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
        sets: [],
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

    it('saves a result and the recomputed standings and status', async () => {
      const { agent, tournament } = await createTournament();

      const res = await agent
        .patch(url(tournament.id, '/matches/p1-p2'))
        .send({ sets: sets('3-6 7-6(4) 4-6'), courtId: 'c2' });

      expect(res.status).toBe(200);
      const saved = (await TournamentModel.findById(tournament.id))!.toObject();
      expect(saved.matches.find((m) => m.id === 'p1-p2')).toMatchObject({
        sets: [
          { a: 3, b: 6 },
          { a: 7, b: 6, tiebreak: { a: 7, b: 4 } },
          { a: 4, b: 6 },
        ],
        courtId: 'c2',
        state: 'done',
        winner: 'p2',
      });
      expect(saved.groups[0].standings[0]).toMatchObject({ pairId: 'p2', wins: 1, setsFor: 2 });
      expect(saved.summary).toMatchObject({ status: 'groups', matchesDone: 1 });
    });

    it('explains a refused change and saves nothing', async () => {
      const { agent, tournament } = await createTournament();

      const res = await agent
        .patch(url(tournament.id, '/matches/p1-p2'))
        .send({ sets: sets('6-4 8-6') });

      expect(res.status).toBe(400);
      expect(res.body.issues).toEqual([
        { code: 'SCORE_SET_INVALID', params: { set: 2, games: 6, points: 7 } },
      ]);
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

      const drawn = await agent.post(url(tournament.id, '/draw'));
      expect(drawn.status).toBe(200);

      // The draw changes who plays whom: score one of the new group matches
      const firstMatch = drawn.body.matches.find((m: { phase: string }) => m.phase === 'group');
      const scored = await agent
        .patch(url(tournament.id, `/matches/${firstMatch.id}`))
        .send({ sets: sets('6-1 6-1') });
      expect(scored.status).toBe(200);
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
        .send({ sets: sets('6-1 6-1') });

      expect(unknown.status).toBe(404);
      expect(notOwner.status).toBe(404);
    });

    it('refuses to overwrite a tournament saved in the meantime', async () => {
      const { agent, tournament } = await createTournament();
      const stale = await TournamentModel.findById(tournament.id);
      await agent.patch(url(tournament.id, '/matches/p1-p2')).send({ sets: sets('6-1 6-1') });

      stale!.name = 'Changed elsewhere';
      await expect(stale!.save()).rejects.toThrow(/No matching document/);
    });
  });

  describe('settings, reset, export and import', () => {
    const url = (id: string, path = '') => `/api/tournaments/${id}${path}`;

    it('saves settings and shows scheduling conflicts', async () => {
      const { agent, tournament } = await createTournament();
      await agent
        .patch(url(tournament.id, '/matches/p1-p2'))
        .send({ courtId: 'c1', timeSlotId: 't1' });
      const clash = await agent
        .patch(url(tournament.id, '/matches/p4-p5'))
        .send({ courtId: 'c1', timeSlotId: 't1' });
      expect(clash.body.conflicts).toEqual([
        { kind: 'court', timeSlotId: 't1', courtId: 'c1', matchIds: ['p1-p2', 'p4-p5'] },
      ]);

      const res = await agent
        .patch(url(tournament.id, '/settings'))
        .send({ name: 'Estate', courts: [{ id: 'c2', name: 'Mediolanum' }] });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        name: 'Estate',
        courts: [{ id: 'c2', name: 'Mediolanum' }],
      });
      // Court 1 is gone: its matches have no court, and the clash is gone with it
      expect(res.body.conflicts).toEqual([]);
      expect((await agent.get(url(tournament.id))).body.name).toBe('Estate');

      const bad = await agent.patch(url(tournament.id, '/settings')).send({ timeSlots: [] });
      expect(bad.status).toBe(400);
      expect(bad.body.issues).toEqual([{ code: 'SLOTS_REQUIRED' }]);
    });

    it('resets the results', async () => {
      const { agent, tournament } = await createTournament();
      await agent.patch(url(tournament.id, '/matches/p1-p2')).send({ sets: sets('6-1 6-1') });

      const res = await agent.post(url(tournament.id, '/reset'));

      expect(res.status).toBe(200);
      expect(res.body.summary).toMatchObject({ status: 'draft', matchesDone: 0 });
    });

    it('exports a tournament and imports it as a new one', async () => {
      const { agent, tournament } = await createTournament();
      await agent.patch(url(tournament.id, '/pairs/p1')).send({ players: ['Rossi', 'Bianchi'] });
      await agent.patch(url(tournament.id, '/matches/p1-p2')).send({ sets: sets('6-1 6-1') });

      const file = await agent.get(url(tournament.id, '/export'));
      expect(file.status).toBe(200);
      const imported = await agent.post('/api/tournaments/import').send(file.body);

      expect(imported.status).toBe(201);
      expect(imported.body.id).not.toBe(tournament.id);
      expect(imported.body.pairs[0].players).toEqual(['Rossi', 'Bianchi']);
      expect(imported.body.summary).toMatchObject({ status: 'groups', matchesDone: 1 });
      expect(await TournamentModel.countDocuments()).toBe(2);

      const invalid = await agent.post('/api/tournaments/import').send({ hello: 'world' });
      expect(invalid.status).toBe(400);
      expect(invalid.body.issues).toEqual([{ code: 'IMPORT_INVALID' }]);
    });

    it("cannot export, change or reset someone else's tournament", async () => {
      const { tournament } = await createTournament();
      const { agent: otherAgent } = await signUp(t, other);

      expect((await otherAgent.get(url(tournament.id, '/export'))).status).toBe(404);
      const settings = await otherAgent.patch(url(tournament.id, '/settings')).send({ name: 'X' });
      expect(settings.status).toBe(404);
      expect((await otherAgent.post(url(tournament.id, '/reset'))).status).toBe(404);
    });
  });
});
