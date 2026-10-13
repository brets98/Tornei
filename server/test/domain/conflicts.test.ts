import { describe, expect, it } from 'vitest';
import { updateMatch } from '../../src/domain/edit.js';
import { parseSetup } from '../../src/domain/setup.js';
import { buildTournament } from '../../src/domain/tournament.js';
import type { TournamentData } from '../../src/domain/types.js';
import { validSetup } from '../fixtures.js';

/** Group A is p1, p2, p3; courts c1, c2; slots t1 09:30, t2 19:00, t3 20:00. */
function schedule(entries: [matchId: string, courtId: string | null, slotId: string][]) {
  let t: TournamentData = buildTournament(parseSetup(validSetup).setup);
  for (const [matchId, courtId, timeSlotId] of entries) {
    t = updateMatch(t, matchId, { courtId, timeSlotId }).data!;
  }
  return t.conflicts;
}

describe('conflicts', () => {
  it('has none when every match has its own court and time', () => {
    expect(
      schedule([
        ['p1-p2', 'c1', 't1'],
        ['p4-p5', 'c2', 't1'],
        ['p1-p3', 'c1', 't2'],
      ]),
    ).toEqual([]);
  });

  it('finds two matches on the same court at the same time', () => {
    expect(
      schedule([
        ['p1-p2', 'c1', 't2'],
        ['p4-p5', 'c1', 't2'],
      ]),
    ).toEqual([{ kind: 'court', timeSlotId: 't2', courtId: 'c1', matchIds: ['p1-p2', 'p4-p5'] }]);
  });

  it('finds a pair playing two matches at the same time, also without a court', () => {
    expect(
      schedule([
        ['p1-p2', 'c1', 't1'],
        ['p1-p3', null, 't1'],
      ]),
    ).toEqual([{ kind: 'pair', timeSlotId: 't1', pairId: 'p1', matchIds: ['p1-p2', 'p1-p3'] }]);
  });

  it('lists them in time order', () => {
    const conflicts = schedule([
      ['p1-p2', 'c1', 't3'],
      ['p4-p5', 'c1', 't3'],
      ['p7-p8', 'c2', 't1'],
      ['p10-p11', 'c2', 't1'],
    ]);
    expect(conflicts.map((c) => c.timeSlotId)).toEqual(['t1', 't3']);
  });
});
