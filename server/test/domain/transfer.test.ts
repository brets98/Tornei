import { describe, expect, it } from 'vitest';
import { setGroups, setPlayers, updateMatch, updateSettings } from '../../src/domain/edit.js';
import { parseSetup } from '../../src/domain/setup.js';
import { buildTournament } from '../../src/domain/tournament.js';
import { exportTournament, importTournament } from '../../src/domain/transfer.js';
import type { TournamentData } from '../../src/domain/types.js';
import { sets, validSetup } from '../fixtures.js';

/** A tournament with names, moved groups, renamed courts, a schedule and results. */
function played(): TournamentData {
  let t = buildTournament(parseSetup(validSetup).setup);
  t = setPlayers(t, 'p1', ['Rossi', 'Bianchi']).data!;
  const groups = t.groups.map((g) => ({ id: g.id, pairIds: [...g.pairIds] }));
  [groups[0].pairIds[0], groups[1].pairIds[0]] = [groups[1].pairIds[0], groups[0].pairIds[0]];
  t = setGroups(t, groups).data!;
  t = updateSettings(t, {
    courts: [{ id: 'c2', name: 'Centrale' }, { name: 'Nuovo' }],
    timeSlots: [{ id: 't3', time: '20:00' }],
  }).data!;
  for (const m of t.matches.filter((m) => m.phase === 'group')) {
    t = updateMatch(t, m.id, { sets: sets('6-3 3-6 7-6(4)') }).data!;
  }
  t = updateMatch(t, t.matches.find((m) => m.phase === 'group')!.id, {
    courtId: 'c3',
    timeSlotId: 't3',
  }).data!;
  const first = t.matches.find((m) => m.bracket === 'A' && m.round === 0)!;
  return updateMatch(t, first.id, { sets: sets('6-0 6-0') }).data!;
}

/** Through JSON, as a real file would be. */
const roundTrip = (t: TournamentData) =>
  importTournament(JSON.parse(JSON.stringify(exportTournament(t))));

describe('export and import', () => {
  it('gives back the same tournament, derived state included', () => {
    const t = played();
    const result = roundTrip(t);

    expect(result.issues).toBeUndefined();
    expect(result.data).toEqual(t);
  });

  it('leaves the derived state out of the file', () => {
    const file = exportTournament(played());
    expect(file).toMatchObject({ format: 'tornei.tournament', version: 1 });
    expect(file.tournament).not.toHaveProperty('summary');
    expect(file.tournament.matches[0]).not.toHaveProperty('state');
  });

  it('keeps a knockout result that no longer counts', () => {
    let t = buildTournament(
      parseSetup({ ...validSetup, pairCount: 4, structure: { type: 'knockout' } }).setup,
    );
    t = updateMatch(t, 'A0-0', { sets: sets('6-1 6-1') }).data!;
    t = updateMatch(t, 'A0-1', { sets: sets('6-1 6-1') }).data!;
    t = updateMatch(t, 'A1-0', { sets: sets('6-1 6-1') }).data!;
    t = updateMatch(t, 'A0-0', { sets: sets('1-6 1-6') }).data!;
    expect(t.matches.find((m) => m.id === 'A1-0')!.state).toBe('stale');

    expect(roundTrip(t).data).toEqual(t);
  });

  it('refuses files that are not tournaments, or from an unknown version', () => {
    const file = exportTournament(played());
    const codes = (value: unknown) => importTournament(value).issues?.map((i) => i.code);

    expect(codes({ hello: 'world' })).toEqual(['IMPORT_INVALID']);
    expect(codes(null)).toEqual(['IMPORT_INVALID']);
    expect(codes({ ...file, version: 99 })).toEqual(['IMPORT_VERSION']);
    const edit = (changes: object) =>
      codes({ ...file, tournament: { ...file.tournament, ...changes } });
    expect(edit({ pairs: [...file.tournament.pairs].reverse() })).toEqual(['IMPORT_INVALID']);
    expect(edit({ courts: [{ id: 'x', name: 'A' }] })).toEqual(['IMPORT_INVALID']);
    expect(edit({ matches: [{ id: 'nope', sets: [] }] })).toEqual(['IMPORT_INVALID']);
  });

  it('checks the setup and the results like the wizard and the editor', () => {
    const file = exportTournament(played());
    const edit = (changes: object) =>
      importTournament({ ...file, tournament: { ...file.tournament, ...changes } }).issues;

    expect(edit({ name: '' })).toEqual([{ code: 'NAME_REQUIRED' }]);
    expect(edit({ groups: [] })).toEqual([{ code: 'GROUPS_INVALID' }]);
    const [first, ...rest] = file.tournament.matches;
    expect(edit({ matches: [{ ...first, sets: [{ a: 6, b: 5 }] }, ...rest] })).toEqual([
      { code: 'SCORE_SET_INVALID', params: { set: 1, games: 6, points: 7 } },
    ]);
  });
});
