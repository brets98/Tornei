import { describe, expect, it } from 'vitest';
import { buildMatchFormat, exampleResult, formatResult, parseResult, sideGames } from './score';

describe('parseResult', () => {
  it('reads sets, side A first', () => {
    expect(parseResult('6-3 4-6 6-2')).toEqual({
      sets: [
        { a: 6, b: 3 },
        { a: 4, b: 6 },
        { a: 6, b: 2 },
      ],
    });
  });

  it("reads a tie-break from the loser's points, or from both", () => {
    expect(parseResult('7-6(5) 6-7(10)')).toEqual({
      sets: [
        { a: 7, b: 6, tiebreak: { a: 7, b: 5 } },
        { a: 6, b: 7, tiebreak: { a: 10, b: 12 } },
      ],
    });
    expect(parseResult('7-6(9-7)')).toEqual({ sets: [{ a: 7, b: 6, tiebreak: { a: 9, b: 7 } }] });
  });

  it('reads a deciding set tie-break to 10 from the format', () => {
    const slam = { bestOf: 5, gamesPerSet: 6, decider: 'tiebreak10' } as const;
    const parsed = parseResult('7-6(3) 3-6 6-3 4-6 7-6(3)', slam);
    expect('sets' in parsed && parsed.sets.map((s) => s.tiebreak)).toEqual([
      { a: 7, b: 3 },
      undefined,
      undefined,
      undefined,
      { a: 10, b: 3 },
    ]);
  });

  it('accepts the usual ways of typing a result', () => {
    const expected = parseResult('6-4 3-6 10-8');
    for (const text of ['6-4, 3-6, 10-8', ' 6 - 4  3–6 [10-8] ', '6/4 3/6 10/8', '6:4;3:6;10:8']) {
      expect(parseResult(text)).toEqual(expected);
    }
    expect(parseResult('7-6 (5)')).toEqual(parseResult('7-6(5)'));
  });

  it('clears the result with empty text', () => {
    expect(parseResult('  ')).toEqual({ sets: [] });
  });

  it('reports what it cannot read', () => {
    expect(parseResult('6-4 sei-tre')).toEqual({ unreadable: 'sei-tre' });
    expect(parseResult('64')).toEqual({ unreadable: '64' });
  });
});

describe('exampleResult', () => {
  it('shows how a result looks in each format', () => {
    expect(exampleResult(buildMatchFormat('bestOf3', 'set'))).toBe('6-4 3-6 7-6(5)');
    expect(exampleResult(buildMatchFormat('bestOf3', 'superTiebreak'))).toBe('6-4 3-6 10-8');
    expect(exampleResult(buildMatchFormat('bestOf5', 'set'))).toBe('6-4 3-6 6-3 4-6 7-6(5)');
    expect(exampleResult(buildMatchFormat('proSet', 'superTiebreak'))).toBe('9-7');
  });
});

describe('formatResult', () => {
  it("writes the result back, with the tie-break loser's points", () => {
    const text = '6-2 7-6(5) 6-7(10)';
    const parsed = parseResult(text);
    expect('sets' in parsed && formatResult(parsed.sets)).toBe(text);
  });
});

describe('sideGames', () => {
  it("shows each side's games, the tie-break points on the side that lost the set", () => {
    const parsed = parseResult('6-2 7-6(5)');
    const sets = 'sets' in parsed ? parsed.sets : [];

    expect(sideGames(sets, 'a')).toEqual([
      { games: 6, won: true, tiebreak: undefined },
      { games: 7, won: true, tiebreak: undefined },
    ]);
    expect(sideGames(sets, 'b')).toEqual([
      { games: 2, won: false, tiebreak: undefined },
      { games: 6, won: false, tiebreak: 5 },
    ]);
  });
});
