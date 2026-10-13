import { describe, expect, it } from 'vitest';
import { checkSets, MATCH_FORMATS, outcome } from '../../src/domain/score.js';
import type { MatchFormat } from '../../src/domain/types.js';
import { sets } from '../fixtures.js';

const { bestOf3, bestOf3SuperTiebreak, oneSet, proSet } = MATCH_FORMATS;
const code = (text: string, format: MatchFormat = bestOf3) =>
  checkSets(sets(text), format)?.code ?? null;

describe('checkSets', () => {
  it.each([
    '6-0 6-4',
    '6-4 3-6 7-5',
    '7-6 6-7 7-6',
    '7-6(5) 6-2',
    '6-7(10) 7-6(3) 6-4',
    '4-6 6-3 6-1',
  ])('accepts %s in best of 3', (text) => expect(code(text)).toBeNull());

  it('accepts an empty result: it clears the match', () => {
    expect(checkSets([], bestOf3)).toBeNull();
  });

  it.each([
    ['6-5 6-0', 'SCORE_SET_INVALID'],
    ['8-6 6-0', 'SCORE_SET_INVALID'],
    ['7-3 6-0', 'SCORE_SET_INVALID'],
    ['6-6 6-0', 'SCORE_SET_TIED'],
    ['6-4', 'SCORE_INCOMPLETE'],
    ['6-4 4-6', 'SCORE_INCOMPLETE'],
    ['6-4 6-4 6-4', 'SCORE_TOO_MANY_SETS'],
    ['6-4(3) 6-0', 'SCORE_TIEBREAK_NOT_PLAYED'],
  ])('rejects %s (%s)', (text, expected) => expect(code(text)).toBe(expected));

  it('checks the tie-break points: 7 by 2, won by the set winner', () => {
    const tiebreak = (a: number, b: number) =>
      checkSets(
        [
          { a: 7, b: 6, tiebreak: { a, b } },
          { a: 6, b: 0 },
        ],
        bestOf3,
      )?.code ?? null;

    expect(tiebreak(7, 5)).toBeNull();
    expect(tiebreak(12, 10)).toBeNull();
    expect(tiebreak(7, 6)).toBe('SCORE_TIEBREAK_INVALID');
    expect(tiebreak(11, 8)).toBe('SCORE_TIEBREAK_INVALID');
    expect(tiebreak(5, 7)).toBe('SCORE_TIEBREAK_INVALID');
  });

  it('says which set is wrong', () => {
    expect(checkSets(sets('6-4 6-5'), bestOf3)).toEqual({
      code: 'SCORE_SET_INVALID',
      params: { set: 2, games: 6 },
    });
  });

  it('plays the third set as a super tie-break to 10 when the format says so', () => {
    expect(code('6-4 3-6 10-8', bestOf3SuperTiebreak)).toBeNull();
    expect(code('6-4 3-6 12-10', bestOf3SuperTiebreak)).toBeNull();
    expect(code('6-4 3-6 10-9', bestOf3SuperTiebreak)).toBe('SCORE_SUPER_TIEBREAK_INVALID');
    expect(code('6-4 3-6 6-3', bestOf3SuperTiebreak)).toBe('SCORE_SUPER_TIEBREAK_INVALID');
    // Only the deciding set is a super tie-break
    expect(code('10-8 6-3', bestOf3SuperTiebreak)).toBe('SCORE_SET_INVALID');
  });

  it('plays one set, or a pro set to 9 with the tie-break at 8-8', () => {
    expect(code('6-3', oneSet)).toBeNull();
    expect(code('6-3 6-3', oneSet)).toBe('SCORE_TOO_MANY_SETS');
    expect(code('9-7', proSet)).toBeNull();
    expect(code('9-8(4)', proSet)).toBeNull();
    expect(code('10-8', proSet)).toBe('SCORE_SET_INVALID');
    expect(code('6-4', proSet)).toBe('SCORE_SET_INVALID');
  });

  it('rejects malformed data', () => {
    for (const bad of [
      null,
      'x',
      [{ a: -1, b: 6 }],
      [{ a: 6 }],
      [{ a: 6, b: 1.5 }],
      [{ a: 7, b: 6, tiebreak: { a: 'x' } }],
    ]) {
      expect(checkSets(bad, bestOf3)?.code).toBe('SCORE_MALFORMED');
    }
  });
});

describe('outcome', () => {
  it('counts sets and games for each side', () => {
    expect(outcome(sets('6-7(5) 7-5 6-2'), bestOf3)).toEqual({
      winner: 'A',
      setsA: 2,
      setsB: 1,
      gamesA: 19,
      gamesB: 14,
    });
  });

  it('counts a super tie-break as one game', () => {
    expect(outcome(sets('4-6 6-3 8-10'), bestOf3SuperTiebreak)).toEqual({
      winner: 'B',
      setsA: 1,
      setsB: 2,
      gamesA: 10,
      gamesB: 10,
    });
  });
});
