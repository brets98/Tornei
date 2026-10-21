import { describe, expect, it } from 'vitest';
import {
  draw,
  resetBracket,
  resetResults,
  setGroups,
  setPlayers,
  updateMatch,
  updateSettings,
} from '../../src/domain/edit.js';
import { parseSetup } from '../../src/domain/setup.js';
import { buildTournament } from '../../src/domain/tournament.js';
import type { TournamentData } from '../../src/domain/types.js';
import { sets, validSetup } from '../fixtures.js';

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

  it('is locked once a result is entered', () => {
    const t = ok(updateMatch(build(), 'p1-p2', { sets: sets('6-1 6-1') }));
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
  it('saves result, court and time, and recomputes the standings', () => {
    const t = ok(
      updateMatch(build(), 'p2-p3', {
        sets: sets('2-6 7-6(5) 4-6'),
        courtId: 'c1',
        timeSlotId: 't2',
      }),
    );

    expect(match(t, 'p2-p3')).toMatchObject({
      sets: [
        { a: 2, b: 6 },
        { a: 7, b: 6, tiebreak: { a: 7, b: 5 } },
        { a: 4, b: 6 },
      ],
      courtId: 'c1',
      timeSlotId: 't2',
      state: 'done',
      winner: 'p3',
    });
    expect(t.groups[0].standings[0]).toMatchObject({ pairId: 'p3', setsFor: 2, setsAgainst: 1 });
    expect(t.summary.status).toBe('groups');
  });

  it('changes only the fields sent, and clears the result with an empty list', () => {
    let t = ok(updateMatch(build(), 'p1-p2', { courtId: 'c1' }));
    t = ok(updateMatch(t, 'p1-p2', { sets: sets('6-3 6-3') }));
    expect(match(t, 'p1-p2')).toMatchObject({ courtId: 'c1', state: 'done' });

    t = ok(updateMatch(t, 'p1-p2', { sets: [], courtId: null }));
    expect(match(t, 'p1-p2')).toMatchObject({ sets: [], courtId: null, state: 'todo' });
    expect(t.summary.status).toBe('draft');
  });

  it('rejects results not valid for the match format, explaining why', () => {
    const t = build();

    expect(updateMatch(t, 'p1-p2', { sets: sets('6-4 6-5') }).issues).toEqual([
      { code: 'SCORE_SET_INVALID', params: { set: 2, games: 6, points: 7 } },
    ]);
    expect(codes(updateMatch(t, 'p1-p2', { sets: sets('6-4') }))).toEqual(['SCORE_INCOMPLETE']);
    expect(codes(updateMatch(t, 'p1-p2', { sets: '6-4 6-4' }))).toEqual(['SCORE_MALFORMED']);
  });

  it('rejects unknown courts and times', () => {
    const t = build();
    expect(codes(updateMatch(t, 'p1-p2', { courtId: 'c9' }))).toEqual(['COURT_UNKNOWN']);
    expect(codes(updateMatch(t, 'p1-p2', { timeSlotId: 't9' }))).toEqual(['SLOT_UNKNOWN']);
    expect(codes(updateMatch(t, 'nope', {}))).toEqual(['NOT_FOUND']);
  });

  it('follows the match format of the tournament', () => {
    const t = build({ matchFormat: { bestOf: 3, gamesPerSet: 6, decider: 'superTiebreak' } });

    expect(codes(updateMatch(t, 'p1-p2', { sets: sets('6-4 3-6 10-7') }))).toBeUndefined();
    expect(codes(updateMatch(t, 'p1-p2', { sets: sets('6-4 3-6 6-3') }))).toEqual([
      'SCORE_SUPER_TIEBREAK_INVALID',
    ]);
  });

  it('accepts a knockout result only once both sides are known', () => {
    const t = build();
    expect(codes(updateMatch(t, 'A0-0', { sets: sets('6-2 6-2') }))).toEqual(['MATCH_NOT_READY']);
    // Court and time can be planned in advance
    expect(match(ok(updateMatch(t, 'A0-0', { courtId: 'c1' })), 'A0-0').courtId).toBe('c1');
  });

  it('refuses a result on a bye', () => {
    const t = build({ pairCount: 3, structure: { type: 'knockout' } });
    expect(codes(updateMatch(t, 'A0-0', { sets: sets('6-0 6-0') }))).toEqual(['MATCH_BYE']);
  });

  it('remembers who played a knockout match', () => {
    const t = ok(
      updateMatch(build({ pairCount: 4, structure: { type: 'knockout' } }), 'A0-0', {
        sets: sets('6-1 6-1'),
      }),
    );
    expect(match(t, 'A0-0')).toMatchObject({
      scoredPairs: ['p1', 'p4'],
      state: 'done',
      winner: 'p1',
    });
  });
});

describe('updateSettings', () => {
  const courts = (t: TournamentData) => t.courts.map(({ id, name }) => ({ id, name }));
  const slots = (t: TournamentData) => t.timeSlots.map(({ id, time }) => ({ id, time }));

  it('changes name, subtitle and date, trimmed like in the wizard', () => {
    const t = ok(updateSettings(build(), { name: ' Estate ', subtitle: '', date: '2026-11-02' }));
    expect(t).toMatchObject({ name: 'Estate', subtitle: '', date: '2026-11-02' });
    expect(codes(updateSettings(build(), { name: ' ' }))).toEqual(['NAME_REQUIRED']);
    expect(codes(updateSettings(build(), { date: '2026-02-30' }))).toEqual(['DATE_INVALID']);
  });

  it('renames and adds courts, keeping the ids and the matches on them', () => {
    let t = ok(updateMatch(build(), 'p1-p2', { courtId: 'c2' }));
    t = ok(
      updateSettings(t, {
        courts: [{ id: 'c2', name: 'Centrale' }, { id: 'c1', name: 'Bigi' }, { name: 'Nuovo' }],
      }),
    );
    expect(courts(t)).toEqual([
      { id: 'c2', name: 'Centrale' },
      { id: 'c1', name: 'Bigi' },
      { id: 'c3', name: 'Nuovo' },
    ]);
    expect(match(t, 'p1-p2').courtId).toBe('c2');
  });

  it('removes a court or a time slot from the matches that used it', () => {
    let t = ok(updateMatch(build(), 'p1-p2', { courtId: 'c2', timeSlotId: 't1' }));
    t = ok(updateSettings(t, { courts: [{ id: 'c1', name: 'Bigi' }] }));
    t = ok(updateSettings(t, { timeSlots: [{ id: 't2', time: '19:00' }, { time: '8:00' }] }));
    expect(match(t, 'p1-p2')).toMatchObject({ courtId: null, timeSlotId: null });
    // A new id never reuses a removed one; slots stay in time order
    expect(slots(t)).toEqual([
      { id: 't4', time: '08:00' },
      { id: 't2', time: '19:00' },
    ]);
  });

  it('checks courts and slots like the wizard, and refuses unknown ids', () => {
    expect(codes(updateSettings(build(), { courts: [] }))).toEqual(['COURTS_REQUIRED']);
    expect(codes(updateSettings(build(), { courts: [{ name: 'A' }, { name: 'a' }] }))).toEqual([
      'COURT_DUPLICATE',
    ]);
    expect(codes(updateSettings(build(), { timeSlots: [{ time: '25:00' }] }))).toEqual([
      'SLOT_INVALID',
    ]);
    expect(codes(updateSettings(build(), { courts: [{ id: 'c9', name: 'X' }] }))).toEqual([
      'COURT_UNKNOWN',
    ]);
    expect(
      codes(
        updateSettings(build(), {
          timeSlots: [
            { id: 't1', time: '10:00' },
            { id: 't1', time: '11:00' },
          ],
        }),
      ),
    ).toEqual(['SLOT_UNKNOWN']);
  });

  it('changes the match format only until the first result', () => {
    const superTiebreak = { bestOf: 3, gamesPerSet: 6, decider: 'superTiebreak' };
    expect(ok(updateSettings(build(), { matchFormat: superTiebreak })).matchFormat).toEqual(
      superTiebreak,
    );
    const started = ok(updateMatch(build(), 'p1-p2', { sets: sets('6-4 6-4') }));
    expect(codes(updateSettings(started, { matchFormat: superTiebreak }))).toEqual([
      'MATCH_FORMAT_LOCKED',
    ]);
    // Sending the same format again is fine
    expect(updateSettings(started, { matchFormat: started.matchFormat, name: 'X' }).issues).toBe(
      undefined,
    );
  });
});

describe('resetResults', () => {
  it('clears every result and the derived state, keeping the schedule', () => {
    let t = build({ pairCount: 4, structure: { type: 'knockout' } });
    t = ok(updateMatch(t, 'A0-0', { sets: sets('6-1 6-1'), courtId: 'c1' }));
    t = ok(updateMatch(t, 'A0-1', { sets: sets('6-1 6-1') }));
    t = ok(updateMatch(t, 'A1-0', { sets: sets('6-1 6-1') }));
    expect(t.summary.status).toBe('finished');

    const reset = ok(resetResults(t));
    expect(reset.matches.every((m) => m.sets.length === 0 && m.winner === null)).toBe(true);
    expect(reset.brackets[0].champion).toBeNull();
    expect(reset.summary).toMatchObject({ status: 'draft', matchesDone: 0 });
    expect(match(reset, 'A0-0').courtId).toBe('c1');
    expect(match(reset, 'A1-0')).toMatchObject({ pairA: null, pairB: null, state: 'todo' });
  });
});

describe('resetBracket', () => {
  it('clears one bracket, keeping groups, the other bracket and the schedule', () => {
    let t = build({
      pairCount: 4,
      structure: { type: 'groups_knockout', groupCount: 2, advanceA: 1, advanceB: 1 },
    });
    for (const m of t.matches.filter((m) => m.phase === 'group')) {
      t = ok(updateMatch(t, m.id, { sets: sets('6-1 6-1') }));
    }
    t = ok(updateMatch(t, 'A0-0', { sets: sets('6-1 6-1') }));
    t = ok(updateMatch(t, 'B0-0', { sets: sets('6-1 6-1'), courtId: 'c1' }));

    const reset = ok(resetBracket(t, 'B'));
    expect(match(reset, 'B0-0')).toMatchObject({ sets: [], state: 'todo', courtId: 'c1' });
    expect(reset.brackets.map((b) => b.champion)).toEqual([match(t, 'A0-0').winner, null]);
    expect(reset.groups.every((g) => g.complete)).toBe(true);
  });
});
