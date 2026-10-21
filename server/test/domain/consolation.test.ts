import { describe, expect, it } from 'vitest';
import {
  draw,
  resetBracket,
  setLevel,
  setPlayers,
  updateMatch,
  updatePair,
} from '../../src/domain/edit.js';
import { parseSetup } from '../../src/domain/setup.js';
import { buildTournament } from '../../src/domain/tournament.js';
import { exportTournament, importTournament } from '../../src/domain/transfer.js';
import type { TournamentData } from '../../src/domain/types.js';
import { sets, validSetup } from '../fixtures.js';

const names = (count: number) =>
  Array.from({ length: count }, (_, i) => [`Rossi ${i + 1}`, `Bianchi ${i + 1}`]);

const consolationSetup = (count: number) => ({
  ...validSetup,
  structure: { type: 'knockout_consolation' },
  players: names(count),
});

function build(count: number) {
  const { setup, issues } = parseSetup(consolationSetup(count));
  expect(issues).toEqual([]);
  return buildTournament(setup);
}

function ok(result: ReturnType<typeof updateMatch>): TournamentData {
  expect(result.issues).toBeUndefined();
  return result.data!;
}

const codes = (result: ReturnType<typeof updateMatch>) => result.issues?.map((i) => i.code);
const match = (t: TournamentData, id: string) => t.matches.find((m) => m.id === id)!;

/** A repeatable random source (linear congruential), different for each seed. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2 ** 31;
    return state / 2 ** 31;
  };
}

/** Plays a match: side A wins, or side B with `winner: 'B'`. */
function play(t: TournamentData, id: string, winner: 'A' | 'B' = 'A') {
  return ok(updateMatch(t, id, { sets: sets(winner === 'A' ? '6-1 6-1' : '1-6 1-6') }));
}

describe('parseSetup with the consolation draw', () => {
  it('counts the pairs from the list of players', () => {
    const { setup, issues } = parseSetup(consolationSetup(6));
    expect(issues).toEqual([]);
    expect(setup.pairCount).toBe(6);
    expect(setup.players![0]).toEqual(['Rossi 1', 'Bianchi 1']);
  });

  it('needs every player of every pair', () => {
    const players = names(5);
    players[2] = ['Verdi', ' '];
    const { issues } = parseSetup({ ...consolationSetup(5), players });
    expect(issues).toEqual([{ code: 'PLAYERS_INCOMPLETE', params: { n: 3 } }]);
  });

  it('needs at least 4 pairs', () => {
    const { issues } = parseSetup(consolationSetup(3));
    expect(issues).toEqual([{ code: 'PAIR_COUNT_RANGE', params: { min: 4, max: 64 } }]);
  });

  it('takes one name per player in singles', () => {
    const { setup, issues } = parseSetup({
      ...consolationSetup(0),
      sport: 'tennis',
      format: 'singles',
      players: [['Sinner'], ['Alcaraz'], ['Zverev'], ['Fritz']],
    });
    expect(issues).toEqual([]);
    expect(setup.pairCount).toBe(4);
  });
});

describe('buildTournament with the consolation draw', () => {
  it('draws the bracket at random and adds a consolation bracket half its size', () => {
    const t = build(6);
    expect(t.pairs[0].players).toEqual(['Rossi 1', 'Bianchi 1']);
    expect([...t.seeding].sort()).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
    expect(t.brackets.map((b) => [b.id, b.size])).toEqual([
      ['A', 8],
      ['C', 4],
    ]);
    expect(match(t, 'C0-0')).toMatchObject({
      sourceA: { kind: 'firstLoser', matchId: 'A0-0' },
      sourceB: { kind: 'firstLoser', matchId: 'A0-1' },
    });
  });

  it('uses the random source it is given', () => {
    const { setup } = parseSetup(consolationSetup(4));
    const first = buildTournament(setup, () => 0.99);
    expect(first.seeding).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(buildTournament(setup, () => 0).seeding).not.toEqual(first.seeding);
  });
});

describe('levels in the consolation draw', () => {
  const withLevels = (levels: unknown[], random?: () => number) => {
    const { setup, issues } = parseSetup({ ...consolationSetup(levels.length), levels });
    expect(issues).toEqual([]);
    return buildTournament(setup, random);
  };

  it('puts everyone at the weakest level when none is sent', () => {
    const t = build(4);
    expect(t.pairs.map((p) => p.level)).toEqual([4, 4, 4, 4]);
  });

  it('refuses levels out of range or missing', () => {
    expect(parseSetup({ ...consolationSetup(4), levels: [1, 2, 5, 4] }).issues).toEqual([
      { code: 'LEVELS_INVALID', params: { max: 4 } },
    ]);
    expect(parseSetup({ ...consolationSetup(4), levels: [1, 2] }).issues).toEqual([
      { code: 'LEVELS_INVALID', params: { max: 4 } },
    ]);
  });

  // 6 pairs in 8 slots: the two byes go to seeds 1 and 2, in A0-0 and A0-2
  it('gives the byes to the best levels, whatever the draw', () => {
    for (const random of [() => 0, () => 0.5, () => 0.99, Math.random]) {
      const t = withLevels([4, 4, 1, 4, 2, 4], random);
      expect(t.pairs[2].level).toBe(1);
      expect(match(t, 'A0-0')).toMatchObject({ state: 'bye', winner: 'p3' });
      expect(match(t, 'A0-2')).toMatchObject({ state: 'bye', winner: 'p5' });
    }
  });

  it('keeps the best pairs in opposite halves, drawing among equals', () => {
    const halves = new Set<string>();
    for (let seed = 1; seed <= 10; seed++) {
      const t = withLevels([3, 1, 3, 3, 1, 3, 3, 3], seeded(seed));
      // Seeds 1 and 2 start in A0-0 (top half) and A0-2 (bottom half)
      const top = match(t, 'A0-0').pairA!;
      const bottom = match(t, 'A0-2').pairA!;
      expect([top, bottom].sort()).toEqual(['p2', 'p5']);
      halves.add(top);
    }
    expect(halves.size).toBe(2);
  });
});

describe('the consolation bracket', () => {
  it('takes the losers of the first round', () => {
    let t = build(8);
    t = play(t, 'A0-0');
    t = play(t, 'A0-1', 'B');
    const losers = [match(t, 'A0-0').pairB, match(t, 'A0-1').pairA];
    expect(match(t, 'C0-0')).toMatchObject({ pairA: losers[0], pairB: losers[1], state: 'todo' });
  });

  // 6 pairs in 8 slots: A0-0 and A0-2 are byes; their pairs first play in A1-0 and A1-1
  it('takes a pair that lost its first match after a bye', () => {
    let t = build(6);
    const byePair = match(t, 'A0-0').winner;
    t = play(t, 'A0-1');
    expect(match(t, 'C0-0').pairA).toBeNull();

    t = play(t, 'A1-0', 'B');
    expect(match(t, 'C0-0')).toMatchObject({
      pairA: byePair,
      pairB: match(t, 'A0-1').pairB,
      state: 'todo',
    });
  });

  it('gives a walkover when the pair after a bye wins its first match', () => {
    let t = build(6);
    t = play(t, 'A0-1');
    t = play(t, 'A1-0');
    const loser = match(t, 'A0-1').pairB;
    expect(match(t, 'C0-0')).toMatchObject({
      pairA: null,
      pairB: loser,
      state: 'bye',
      winner: loser,
    });
    expect(match(t, 'C1-0').pairA).toBe(loser);
  });

  it('flags a consolation score when its match becomes a walkover', () => {
    let t = build(6);
    t = play(t, 'A0-1');
    t = play(t, 'A1-0', 'B');
    t = play(t, 'C0-0');
    t = play(t, 'A1-0'); // the bye pair now wins: nobody comes from A0-0

    expect(match(t, 'C0-0')).toMatchObject({ state: 'stale', winner: null });
    t = ok(updateMatch(t, 'C0-0', { sets: [] }));
    expect(match(t, 'C0-0').state).toBe('bye');
  });

  it('finishes when both brackets have a champion', () => {
    let t = build(4);
    for (const id of ['A0-0', 'A0-1', 'A1-0']) t = play(t, id);
    expect(t.summary.status).toBe('knockout');
    t = play(t, 'C0-0');
    expect(t.brackets.map((b) => b.champion)).toEqual([
      match(t, 'A1-0').winner,
      match(t, 'C0-0').winner,
    ]);
    expect(t.summary).toEqual({ status: 'finished', matchesDone: 4, matchesTotal: 4 });
  });
});

describe('edits of the consolation draw', () => {
  it('redraws by level until the first result', () => {
    // p6 becomes the only level 1: the redraw gives it the first bye
    const t = ok(setLevel(build(6), 'p6', 1));
    expect(t.pairs[5].level).toBe(1);
    const drawn = ok(draw(t, seeded(7)));
    expect(drawn.seeding[0]).toBe('p6');
    expect(match(drawn, 'A0-0')).toMatchObject({ state: 'bye', winner: 'p6' });

    const started = play(drawn, 'A0-1');
    expect(codes(draw(started))).toEqual(['STRUCTURE_LOCKED']);
    expect(codes(setLevel(started, 'p1', 2))).toEqual(['STRUCTURE_LOCKED']);
  });

  it('checks the level', () => {
    expect(codes(setLevel(build(4), 'p1', 5))).toEqual(['LEVELS_INVALID']);
    expect(codes(setLevel(build(4), 'p1', '2'))).toEqual(['LEVELS_INVALID']);
    expect(codes(setLevel(build(4), 'p9', 2))).toEqual(['NOT_FOUND']);
    const knockout = buildTournament(
      parseSetup({ ...validSetup, structure: { type: 'knockout' } }).setup,
    );
    expect(codes(setLevel(knockout, 'p1', 2))).toEqual(['NOT_FOUND']);
  });

  it('changes players and level together, or refuses an empty change', () => {
    const t = ok(updatePair(build(4), 'p2', { players: ['Verdi', 'Neri'], level: 2 }));
    expect(t.pairs[1]).toEqual({ id: 'p2', players: ['Verdi', 'Neri'], level: 2 });
    expect(codes(updatePair(build(4), 'p2', {}))).toEqual(['PLAYERS_INVALID']);
  });

  it('lets names change but not be removed', () => {
    expect(ok(setPlayers(build(4), 'p1', ['Verdi', 'Neri'])).pairs[0].players).toEqual([
      'Verdi',
      'Neri',
    ]);
    expect(codes(setPlayers(build(4), 'p1', ['Verdi', '']))).toEqual(['PLAYERS_REQUIRED']);
  });

  it('empties the consolation bracket alone, or with the main one it comes from', () => {
    let t = build(4);
    for (const id of ['A0-0', 'A0-1', 'A1-0', 'C0-0']) t = play(t, id);

    const consolation = ok(resetBracket(t, 'C'));
    expect(match(consolation, 'C0-0')).toMatchObject({ sets: [], scoredPairs: [], state: 'todo' });
    expect(match(consolation, 'A1-0').state).toBe('done');

    const main = ok(resetBracket(t, 'A'));
    expect(main.matches.every((m) => m.sets.length === 0)).toBe(true);
    expect(main.summary.status).toBe('draft');

    expect(codes(resetBracket(t, 'B'))).toEqual(['NOT_FOUND']);
  });

  it('exports and imports the draw with its results', () => {
    let t = build(6);
    t = play(t, 'A0-1');
    t = play(t, 'A1-0', 'B');
    const imported = importTournament(JSON.parse(JSON.stringify(exportTournament(t))));
    expect(imported.issues).toBeUndefined();
    expect(imported.data!.seeding).toEqual(t.seeding);
    expect(imported.data!.pairs).toEqual(t.pairs);
    expect(match(imported.data!, 'C0-0')).toEqual(match(t, 'C0-0'));
  });
});
