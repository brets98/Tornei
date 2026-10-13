import { describe, expect, it } from 'vitest';
import { groupSizes, normalizeTime, parseSetup } from '../../src/domain/setup.js';
import { validSetup } from '../fixtures.js';

const codes = (input: unknown) => parseSetup(input).issues.map((i) => i.code);

describe('groupSizes', () => {
  it('splits as evenly as possible, larger groups first', () => {
    expect(groupSizes(12, 4)).toEqual([3, 3, 3, 3]);
    expect(groupSizes(10, 3)).toEqual([4, 3, 3]);
    expect(groupSizes(11, 3)).toEqual([4, 4, 3]);
  });
});

describe('normalizeTime', () => {
  it('pads hours and rejects impossible times', () => {
    expect(normalizeTime('9:30')).toBe('09:30');
    expect(normalizeTime(' 23:00 ')).toBe('23:00');
    expect(normalizeTime('24:00')).toBeNull();
    expect(normalizeTime('19.30')).toBeNull();
  });
});

describe('parseSetup', () => {
  it('accepts a valid setup and normalizes it', () => {
    const { setup, issues } = parseSetup(validSetup);

    expect(issues).toEqual([]);
    expect(setup).toMatchObject({
      name: 'Torneo di primavera',
      timeSlots: ['09:30', '19:00', '20:00'],
      structure: { type: 'groups_knockout', groupCount: 4, advanceA: 2, advanceB: 1 },
    });
  });

  it('reports every missing field of an empty body', () => {
    expect(codes(undefined)).toEqual(
      expect.arrayContaining([
        'NAME_REQUIRED',
        'SPORT_INVALID',
        'FORMAT_INVALID',
        'DATE_INVALID',
        'PAIR_COUNT_RANGE',
        'COURTS_REQUIRED',
        'SLOTS_REQUIRED',
        'STRUCTURE_INVALID',
      ]),
    );
  });

  it('allows singles only in tennis', () => {
    expect(codes({ ...validSetup, format: 'singles' })).toEqual(['PADEL_SINGLES']);
    expect(codes({ ...validSetup, sport: 'tennis', format: 'singles' })).toEqual([]);
  });

  it('rejects impossible dates, duplicate courts and bad time slots', () => {
    expect(codes({ ...validSetup, date: '2026-02-30' })).toEqual(['DATE_INVALID']);
    expect(codes({ ...validSetup, courts: ['Bigi', 'bigi '] })).toEqual(['COURT_DUPLICATE']);
    expect(codes({ ...validSetup, courts: ['Bigi', ''] })).toEqual(['COURT_NAME_REQUIRED']);
    expect(codes({ ...validSetup, timeSlots: ['19:00', '7:00', '07:00'] })).toEqual([
      'SLOT_DUPLICATE',
    ]);
    expect(codes({ ...validSetup, timeSlots: ['19:00', 'sera'] })).toEqual(['SLOT_INVALID']);
  });

  it('needs at least 2 pairs per group', () => {
    const { issues } = parseSetup({
      ...validSetup,
      pairCount: 7,
      structure: { ...validSetup.structure, groupCount: 4, advanceA: 1, advanceB: 0 },
    });

    expect(issues).toEqual([{ code: 'GROUP_COUNT_RANGE', params: { pairs: 7, max: 3 } }]);
  });

  it('cannot qualify more pairs than the smallest group has', () => {
    // 10 pairs in 3 groups: 4, 3, 3
    const { issues } = parseSetup({
      ...validSetup,
      pairCount: 10,
      structure: { type: 'groups_knockout', groupCount: 3, advanceA: 2, advanceB: 2 },
    });

    expect(issues).toEqual([
      { code: 'ADVANCE_EXCEEDS_GROUP', params: { smallest: 3, advance: 4 } },
    ]);
  });

  it('needs at least 2 entrants in each bracket', () => {
    const structure = { type: 'groups_knockout', groupCount: 1, advanceA: 2, advanceB: 1 };

    expect(parseSetup({ ...validSetup, pairCount: 4, structure }).issues).toEqual([
      { code: 'BRACKET_TOO_SMALL', params: { bracket: 'B' } },
    ]);
    expect(codes({ ...validSetup, structure: { ...structure, advanceA: 0 } })).toEqual([
      'ADVANCE_A_MIN',
    ]);
  });

  it('ignores group fields that do not apply to the structure', () => {
    const knockout = parseSetup({ ...validSetup, structure: { type: 'knockout', groupCount: 9 } });
    const groups = parseSetup({ ...validSetup, structure: { type: 'groups', advanceA: 3 } });

    expect(knockout.issues).toEqual([]);
    expect(knockout.setup.structure).toEqual({
      type: 'knockout',
      groupCount: 0,
      advanceA: 0,
      advanceB: 0,
    });
    expect(groups.setup.structure).toEqual({
      type: 'groups',
      groupCount: 1,
      advanceA: 0,
      advanceB: 0,
    });
  });
});
