import { describe, expect, it } from 'vitest';
import { parseSetup } from '../../src/domain/setup.js';
import { buildTournament, refreshTournament } from '../../src/domain/tournament.js';
import type { Match, TournamentData } from '../../src/domain/types.js';
import { validSetup } from '../fixtures.js';

function build(overrides: object = {}) {
  const { setup, issues } = parseSetup({ ...validSetup, ...overrides });
  expect(issues).toEqual([]);
  return buildTournament(setup);
}

const byId = (t: TournamentData, id: string) => t.matches.find((m) => m.id === id)!;

/** Enters a score like the API does: knockout results remember who played. */
function score(t: TournamentData, id: string, scoreA: number | null, scoreB: number | null) {
  const matches = t.matches.map((m): Match =>
    m.id === id
      ? {
          ...m,
          scoreA,
          scoreB,
          ...(m.phase === 'knockout' && { scoredPairs: [m.pairA!, m.pairB!] }),
        }
      : m,
  );
  return refreshTournament({ ...t, matches });
}

/** Side A wins every group match of `groupId`. */
function playGroup(t: TournamentData, groupId: string) {
  for (const m of t.matches.filter((m) => m.groupId === groupId)) t = score(t, m.id, 6, 3);
  return t;
}

describe('buildTournament', () => {
  it('creates the prototype tournament: 4 groups of 3, bracket A of 8 and B of 4', () => {
    const t = build();

    expect(t.courts).toEqual([
      { id: 'c1', name: 'Bigi' },
      { id: 'c2', name: 'Mediolanum' },
    ]);
    expect(t.timeSlots.map((s) => s.time)).toEqual(['09:30', '19:00', '20:00']);
    expect(t.pairs[0]).toEqual({ id: 'p1', players: ['', ''] });
    expect(t.groups.map((g) => [g.id, g.pairIds])).toEqual([
      ['A', ['p1', 'p2', 'p3']],
      ['B', ['p4', 'p5', 'p6']],
      ['C', ['p7', 'p8', 'p9']],
      ['D', ['p10', 'p11', 'p12']],
    ]);
    expect(t.brackets).toEqual([
      { id: 'A', size: 8, champion: null },
      { id: 'B', size: 4, champion: null },
    ]);
    const count = (filter: (m: Match) => boolean) => t.matches.filter(filter).length;
    expect(count((m) => m.phase === 'group')).toBe(12);
    expect(count((m) => m.bracket === 'A')).toBe(7);
    expect(count((m) => m.bracket === 'B')).toBe(3);
    expect(t.summary).toEqual({ status: 'draft', matchesDone: 0, matchesTotal: 22 });
    expect(byId(t, 'A0-0').sourceA).toEqual({ kind: 'group', groupId: 'A', position: 1 });
  });

  it('creates one player per entry for singles', () => {
    const t = build({ sport: 'tennis', format: 'singles' });
    expect(t.pairs[0].players).toEqual(['']);
  });

  it('creates a knockout with byes and no groups', () => {
    const t = build({ pairCount: 5, structure: { type: 'knockout' } });

    expect(t.groups).toEqual([]);
    expect(t.seeding).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    // Bracket of 8 with 3 byes: 4 playable matches (1 first round + 2 semifinals + final)
    expect(t.summary.matchesTotal).toBe(4);
    expect(byId(t, 'A0-0')).toMatchObject({ pairA: 'p1', pairB: null, state: 'bye', winner: 'p1' });
    expect(byId(t, 'A1-0')).toMatchObject({ pairA: 'p1', pairB: null });
  });

  it('creates a single round-robin group', () => {
    const t = build({ pairCount: 5, structure: { type: 'groups' } });

    expect(t.groups).toHaveLength(1);
    expect(t.brackets).toEqual([]);
    expect(t.summary.matchesTotal).toBe(10);
  });
});

describe('refreshTournament', () => {
  it('moves from draft to group phase with the first result', () => {
    const t = score(build(), 'p1-p2', 6, 2);

    expect(t.summary).toMatchObject({ status: 'groups', matchesDone: 1 });
    expect(t.groups[0].standings[0]).toMatchObject({ pairId: 'p1', wins: 1 });
  });

  it('flags equal scores as invalid, without counting them', () => {
    const t = score(build(), 'p1-p2', 4, 4);

    expect(byId(t, 'p1-p2').state).toBe('invalid');
    expect(t.summary).toMatchObject({ status: 'groups', matchesDone: 0 });
  });

  it('fills the bracket only once a group is complete', () => {
    let t = score(build(), 'p1-p2', 6, 2);
    expect(byId(t, 'A0-0').pairA).toBeNull();

    t = playGroup(t, 'A');
    expect(t.groups[0].complete).toBe(true);
    // Group A, side A always wins: p1 first, p2 second, p3 third
    const placed = t.matches.flatMap((m) => (m.round === 0 ? [m.pairA, m.pairB] : []));
    expect(placed.filter(Boolean).sort()).toEqual(['p1', 'p2', 'p3']);
  });

  it('advances winners and crowns the champion', () => {
    let t = build({
      structure: { type: 'groups_knockout', groupCount: 4, advanceA: 2, advanceB: 0 },
    });
    for (const g of ['A', 'B', 'C', 'D']) t = playGroup(t, g);
    expect(t.summary.status).toBe('knockout');

    for (const id of ['A0-0', 'A0-1', 'A0-2', 'A0-3', 'A1-0', 'A1-1']) t = score(t, id, 6, 4);
    const final = byId(t, 'A2-0');
    expect(final.pairA).toBe(byId(t, 'A1-0').winner);
    expect(final.pairB).toBe(byId(t, 'A1-1').winner);

    t = score(t, 'A2-0', 3, 6);
    expect(t.brackets[0].champion).toBe(final.pairB);
    expect(t.summary).toEqual({ status: 'finished', matchesDone: 19, matchesTotal: 19 });
  });

  it('flags a later result when an earlier change alters who played it', () => {
    let t = build({ pairCount: 4, structure: { type: 'knockout' } });
    t = score(t, 'A0-0', 6, 1); // p1 beats p4
    t = score(t, 'A0-1', 6, 2); // p2 beats p3
    t = score(t, 'A1-0', 6, 3); // p1 champion
    expect(t.brackets[0].champion).toBe('p1');

    t = score(t, 'A0-0', 1, 6); // now p4 beats p1
    const final = byId(t, 'A1-0');
    expect(final).toMatchObject({ pairA: 'p4', pairB: 'p2', state: 'stale', winner: null });
    expect(t.brackets[0].champion).toBeNull();
    expect(t.summary.status).toBe('knockout');

    // Changing it back makes the final result valid again
    t = score(t, 'A0-0', 6, 1);
    expect(byId(t, 'A1-0').state).toBe('done');
  });
});
