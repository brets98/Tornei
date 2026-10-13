import { describe, expect, it } from 'vitest';
import { draw, setGroups, setPlayers, updateMatch } from '../../src/domain/edit.js';
import { parseSetup } from '../../src/domain/setup.js';
import { buildTournament } from '../../src/domain/tournament.js';
import type { TournamentData } from '../../src/domain/types.js';
import { validSetup } from '../fixtures.js';

function build(overrides: object = {}) {
  return buildTournament(parseSetup({ ...validSetup, ...overrides }).setup);
}

/** Unwraps a successful edit. */
function ok(result: ReturnType<typeof updateMatch>): TournamentData {
  expect(result.issues).toBeUndefined();
  return result.data!;
}

const codes = (result: ReturnType<typeof updateMatch>) => result.issues?.map((i) => i.code);
const groupsOf = (t: TournamentData) => t.groups.map((g) => ({ id: g.id, pairIds: g.pairIds }));
const match = (t: TournamentData, id: string) => t.matches.find((m) => m.id === id)!;

describe('setPlayers', () => {
  it('saves trimmed names', () => {
    const t = ok(setPlayers(build(), 'p1', [' Rossi ', 'Bianchi']));
    expect(t.pairs[0].players).toEqual(['Rossi', 'Bianchi']);
  });

  it('needs one name per player of the format', () => {
    expect(codes(setPlayers(build(), 'p1', ['Rossi']))).toEqual(['PLAYERS_INVALID']);
    expect(codes(setPlayers(build(), 'p1', 'Rossi'))).toEqual(['PLAYERS_INVALID']);
    expect(codes(setPlayers(build(), 'p1', ['x'.repeat(61), '']))).toEqual(['PLAYERS_INVALID']);
    expect(codes(setPlayers(build(), 'p99', ['a', 'b']))).toEqual(['NOT_FOUND']);
  });
});

describe('setGroups', () => {
  it('moves a pair to another group and regenerates the matches', () => {
    const t = build({ pairCount: 13 }); // groups of 4, 3, 3, 3
    const groups = groupsOf(t);
    groups[0].pairIds = ['p1', 'p2', 'p3']; // p4 to group B
    groups[1].pairIds = [...groups[1].pairIds, 'p4'];

    const moved = ok(setGroups(t, groups));

    expect(moved.groups[1].pairIds).toEqual(['p5', 'p6', 'p7', 'p4']);
    expect(moved.matches.filter((m) => m.groupId === 'A')).toHaveLength(3);
    expect(moved.matches.filter((m) => m.groupId === 'B')).toHaveLength(6);
  });

  it('keeps courts and times of the matches that still exist', () => {
    const t = ok(
      updateMatch(build({ pairCount: 13 }), 'p1-p2', { courtId: 'c2', timeSlotId: 't3' }),
    );
    const groups = groupsOf(t);
    groups[0].pairIds = ['p1', 'p2', 'p3'];
    groups[1].pairIds.push('p4');

    expect(match(ok(setGroups(t, groups)), 'p1-p2')).toMatchObject({
      courtId: 'c2',
      timeSlotId: 't3',
    });
  });

  it('refuses groups too small for the qualifiers', () => {
    // 12 pairs in 4 × 3, top 2 to A and 3rd to B: a group of 2 has no third place
    const groups = groupsOf(build());
    groups[0].pairIds = ['p1', 'p2'];
    groups[1].pairIds.push('p3');

    expect(setGroups(build(), groups).issues).toEqual([
      { code: 'ADVANCE_EXCEEDS_GROUP', params: { smallest: 2, advance: 3 } },
    ]);
  });

  it('needs every pair exactly once, in the existing groups', () => {
    const t = build();
    const missing = groupsOf(t);
    missing[0].pairIds = ['p1', 'p2'];
    const twice = groupsOf(t);
    twice[1].pairIds.push('p1');
    const renamed = groupsOf(t).map((g) => ({ ...g, id: g.id.toLowerCase() }));

    for (const groups of [missing, twice, renamed, 'A', null]) {
      expect(codes(setGroups(t, groups))).toEqual(['GROUPS_INVALID']);
    }
  });

  it('is locked once a score is entered', () => {
    const t = ok(updateMatch(build(), 'p1-p2', { scoreA: 6 }));
    expect(codes(setGroups(t, groupsOf(t)))).toEqual(['STRUCTURE_LOCKED']);
    expect(codes(draw(t))).toEqual(['STRUCTURE_LOCKED']);
  });
});

describe('draw', () => {
  it('shuffles pairs across groups, keeping their sizes', () => {
    const t = build({ pairCount: 13 });
    const drawn = ok(draw(t, () => 0.5));

    expect(drawn.groups.map((g) => g.pairIds.length)).toEqual([4, 3, 3, 3]);
    expect(drawn.groups.flatMap((g) => g.pairIds).sort()).toEqual(t.pairs.map((p) => p.id).sort());
    expect(groupsOf(drawn)).not.toEqual(groupsOf(t));
  });

  it('shuffles the seeding of a knockout', () => {
    const t = build({ pairCount: 6, structure: { type: 'knockout' } });
    const drawn = ok(draw(t, () => 0.5));

    expect(drawn.seeding).not.toEqual(t.seeding);
    expect(match(drawn, 'A0-0').pairA).toBe(drawn.seeding[0]);
  });
});

describe('updateMatch', () => {
  it('saves score, court and time, and recomputes the standings', () => {
    const t = ok(
      updateMatch(build(), 'p2-p3', { scoreA: 2, scoreB: 6, courtId: 'c1', timeSlotId: 't2' }),
    );

    expect(match(t, 'p2-p3')).toMatchObject({
      scoreA: 2,
      scoreB: 6,
      courtId: 'c1',
      timeSlotId: 't2',
      state: 'done',
      winner: 'p3',
    });
    expect(t.groups[0].standings[0].pairId).toBe('p3');
    expect(t.summary.status).toBe('groups');
  });

  it('changes only the fields sent, and clears with null', () => {
    let t = ok(updateMatch(build(), 'p1-p2', { scoreA: 6, courtId: 'c1' }));
    t = ok(updateMatch(t, 'p1-p2', { scoreB: 3 }));
    expect(match(t, 'p1-p2')).toMatchObject({ scoreA: 6, scoreB: 3, courtId: 'c1' });

    t = ok(updateMatch(t, 'p1-p2', { scoreA: null, scoreB: null, courtId: null }));
    expect(match(t, 'p1-p2')).toMatchObject({
      scoreA: null,
      scoreB: null,
      courtId: null,
      state: 'todo',
    });
    expect(t.summary.status).toBe('draft');
  });

  it('rejects invalid scores, unknown courts and times', () => {
    const t = build();
    for (const scoreA of [-1, 1.5, '6', 100]) {
      expect(codes(updateMatch(t, 'p1-p2', { scoreA }))).toEqual(['SCORE_INVALID']);
    }
    expect(codes(updateMatch(t, 'p1-p2', { courtId: 'c9' }))).toEqual(['COURT_UNKNOWN']);
    expect(codes(updateMatch(t, 'p1-p2', { timeSlotId: 't9' }))).toEqual(['SLOT_UNKNOWN']);
    expect(codes(updateMatch(t, 'nope', {}))).toEqual(['NOT_FOUND']);
  });

  it('accepts a knockout score only once both sides are known', () => {
    const t = build();
    expect(codes(updateMatch(t, 'A0-0', { scoreA: 6, scoreB: 2 }))).toEqual(['MATCH_NOT_READY']);
    // Court and time can be planned in advance
    expect(match(ok(updateMatch(t, 'A0-0', { courtId: 'c1' })), 'A0-0').courtId).toBe('c1');
  });

  it('refuses a score on a bye', () => {
    const t = build({ pairCount: 3, structure: { type: 'knockout' } });
    expect(codes(updateMatch(t, 'A0-0', { scoreA: 6, scoreB: 0 }))).toEqual(['MATCH_BYE']);
  });

  it('remembers who played a knockout match', () => {
    const t = ok(
      updateMatch(build({ pairCount: 4, structure: { type: 'knockout' } }), 'A0-0', {
        scoreA: 6,
        scoreB: 1,
      }),
    );
    expect(match(t, 'A0-0')).toMatchObject({
      scoredPairs: ['p1', 'p4'],
      state: 'done',
      winner: 'p1',
    });
  });
});
