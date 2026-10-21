import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CATEGORIES,
  parseCircuit,
  parsePastStage,
  placements,
  ranking,
  tournamentEntries,
  type Category,
} from '../../src/domain/circuit.js';
import { updateMatch } from '../../src/domain/edit.js';
import { parseSetup } from '../../src/domain/setup.js';
import { buildTournament } from '../../src/domain/tournament.js';
import type { TournamentData } from '../../src/domain/types.js';
import { sets, validSetup } from '../fixtures.js';

const categories: Category[] = DEFAULT_CATEGORIES.map((c, i) => ({ ...c, id: `k${i + 1}` }));
const P1 = 'k2';

function build(overrides: object) {
  const { setup, issues } = parseSetup({ ...validSetup, ...overrides });
  expect(issues).toEqual([]);
  return buildTournament(setup);
}

/** Plays every match side A wins 6-0 6-0, round after round, until nothing is left. */
function playAll(data: TournamentData) {
  for (;;) {
    const next = data.matches.find((m) => m.state === 'todo' && m.pairA && m.pairB);
    if (!next) return data;
    data = updateMatch(data, next.id, { sets: sets('6-0 6-0') }).data!;
  }
}

/** Links pair pN's players to `${pN}a` and `${pN}b`. */
const linked = (data: TournamentData): TournamentData => ({
  ...data,
  pairs: data.pairs.map((p) => ({ ...p, playerIds: [`${p.id}a`, `${p.id}b`] })),
});

describe('placements', () => {
  it('is null until the tournament is finished', () => {
    expect(placements(build({ pairCount: 4, structure: { type: 'knockout' } }))).toBeNull();
  });

  it('gives each pair the round where it lost in bracket A, byes included', () => {
    // 6 pairs in a bracket of 8: seeds 1 and 2 (p1, p2) skip the first round
    const data = playAll(build({ pairCount: 6, structure: { type: 'knockout' } }));
    const places = placements(data)!;

    expect(places.get(data.brackets[0].champion!)).toBe('winner');
    expect([...places.values()].sort()).toEqual([
      'quarterfinal',
      'quarterfinal',
      'runnerUp',
      'semifinal',
      'semifinal',
      'winner',
    ]);
  });

  it('gives "groups" to pairs that did not reach bracket A, also when they play bracket B', () => {
    const data = playAll(build({}));
    const places = placements(data)!;
    const values = [...places.values()];

    // 12 pairs: 8 in bracket A, 4 out in the groups (they play bracket B)
    expect(values.filter((p) => p === 'groups')).toHaveLength(4);
    expect(values.filter((p) => p === 'quarterfinal')).toHaveLength(4);
  });

  it('ranks a single group like a bracket', () => {
    const data = playAll(build({ pairCount: 5, structure: { type: 'groups' } }));
    const order = data.groups[0].standings.map((r) => placements(data)!.get(r.pairId));

    expect(order).toEqual(['winner', 'runnerUp', 'semifinal', 'semifinal', 'quarterfinal']);
  });
});

describe('ranking', () => {
  it('adds up the points of each player, participation included, best first', () => {
    const stage = linked(playAll(build({ pairCount: 4, structure: { type: 'knockout' } })));
    const champion = stage.brackets[0].champion!;
    const { rows, unlinked } = ranking(
      [{ id: 's1', date: '2026-10-01', categoryId: P1, entries: tournamentEntries(stage) }],
      categories,
      new Map(),
    );

    expect(unlinked).toEqual([]);
    expect(rows).toHaveLength(8);
    expect(rows[0]).toMatchObject({
      playerId: `${champion}a`,
      points: 1010,
      stages: 1,
      wins: 1,
      finals: 1,
      best: 0,
      results: [{ stageId: 's1', place: 'winner', points: 1010 }],
    });
    expect(rows.map((r) => r.points)).toEqual([1010, 1010, 610, 610, 370, 370, 370, 370]);
  });

  it('sums the stages, each in its own category, and skips the unfinished ones', () => {
    const finished = linked(playAll(build({ pairCount: 4, structure: { type: 'knockout' } })));
    const running = linked(build({ pairCount: 4, structure: { type: 'knockout' } }));
    const stages = [
      { id: 's1', date: '2026-10-01', categoryId: P1, entries: tournamentEntries(finished) },
      { id: 's2', date: '2026-10-08', categoryId: 'k1', entries: tournamentEntries(finished) },
      { id: 's3', date: '2026-10-15', categoryId: P1, entries: tournamentEntries(running) },
    ];
    const top = ranking(stages, categories, new Map()).rows[0];

    expect(top).toMatchObject({ points: 1010 + 2010, stages: 2, wins: 2 });
  });

  it('breaks ties by stages won, then finals, then name', () => {
    const data = linked(playAll(build({ pairCount: 4, structure: { type: 'knockout' } })));
    const names = new Map(data.pairs.flatMap((p) => p.playerIds!.map((id) => [id!, id!])));
    const { rows } = ranking(
      [{ id: 's1', date: '2026-10-01', categoryId: P1, entries: tournamentEntries(data) }],
      categories,
      names,
    );
    const pair = (n: number) => rows.slice(n * 2, n * 2 + 2).map((r) => r.playerId);

    // Teammates tie on everything: alphabetical
    expect(pair(0)[0] < pair(0)[1]).toBe(true);
  });

  it('counts the names that are not linked to the registry', () => {
    const data = playAll(build({ pairCount: 4, structure: { type: 'knockout' } }));
    const named = {
      ...data,
      pairs: data.pairs.map((p) => ({ ...p, players: ['Rossi', 'Bianchi'] })),
    };
    const result = ranking(
      [{ id: 's1', date: '2026-10-01', categoryId: P1, entries: tournamentEntries(named) }],
      categories,
      new Map(),
    );

    expect(result.rows).toEqual([]);
    expect(result.unlinked).toEqual([{ stageId: 's1', count: 8 }]);
  });
});

describe('parseCircuit', () => {
  const body = { name: ' Circuito estivo ', season: '2027', categories: DEFAULT_CATEGORIES };

  it('trims the fields and numbers the new categories', () => {
    const { circuit, issues } = parseCircuit(body);

    expect(issues).toEqual([]);
    expect(circuit.name).toBe('Circuito estivo');
    expect(circuit.categories.map((c) => c.id)).toEqual(['k1', 'k2', 'k3']);
  });

  it('keeps known ids and never reuses a removed one', () => {
    const { circuit } = parseCircuit(
      { ...body, categories: [categories[2], { ...categories[0], id: undefined }] },
      categories,
    );

    expect(circuit.categories.map((c) => c.id)).toEqual(['k3', 'k4']);
  });

  it('lists every problem', () => {
    const { issues } = parseCircuit({
      name: '',
      categories: [
        { name: 'P1', points: { places: [1, 2], groups: 0, participation: 0 } },
        { name: 'p1', points: { places: [1, 2, 3, 4, 5, 6, 7], groups: -1, participation: 0 } },
      ],
    });

    expect(issues.map((i) => i.code)).toEqual([
      'CIRCUIT_NAME_REQUIRED',
      'CATEGORY_DUPLICATE',
      'POINTS_INVALID',
    ]);
    expect(parseCircuit({ name: 'C', categories: [] }).issues.map((i) => i.code)).toEqual([
      'CATEGORIES_REQUIRED',
    ]);
  });

  it('refuses to remove a category used by a stage', () => {
    const { issues } = parseCircuit({ ...body, categories: [categories[0]] }, categories, [P1]);

    expect(issues).toEqual([{ code: 'CATEGORY_IN_USE', params: { name: 'P1' } }]);
  });
});

describe('parsePastStage', () => {
  it('trims names and keeps the results', () => {
    const { stage, issues } = parsePastStage(
      {
        name: ' Tappa 1 ',
        date: '2026-06-01',
        categoryId: 'k1',
        entries: [
          { players: [' Rossi ', 'Bianchi'], place: 'winner' },
          { players: ['Verdi'], place: 'groups' },
        ],
      },
      categories,
    );

    expect(issues).toEqual([]);
    expect(stage).toEqual({
      name: 'Tappa 1',
      date: '2026-06-01',
      categoryId: 'k1',
      entries: [
        { players: ['Rossi', 'Bianchi'], place: 'winner' },
        { players: ['Verdi'], place: 'groups' },
      ],
    });
  });

  it('lists every problem', () => {
    const { issues } = parsePastStage(
      { name: '', date: '2026-02-30', entries: [{ players: ['A', 'B', 'C'], place: 'third' }] },
      categories,
    );

    expect(issues.map((i) => i.code)).toEqual([
      'STAGE_NAME_REQUIRED',
      'DATE_INVALID',
      'CATEGORY_UNKNOWN',
      'STAGE_ENTRIES_REQUIRED',
      'PLAYERS_INCOMPLETE',
      'STAGE_PLACE_REQUIRED',
    ]);
  });
});
