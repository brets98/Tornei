import { describe, expect, it } from 'vitest';
import { MATCH_FORMATS } from '../../src/domain/score.js';
import { computeStandings, resultState } from '../../src/domain/standings.js';
import { sets } from '../fixtures.js';

const format = MATCH_FORMATS.bestOf3;
const m = (pairA: string, pairB: string, score = '') => ({ pairA, pairB, sets: sets(score) });
const order = (pairIds: string[], matches: ReturnType<typeof m>[]) =>
  computeStandings(pairIds, matches, format).map((r) => r.pairId);

describe('resultState', () => {
  it('is done only with a valid, complete result', () => {
    expect(resultState(m('a', 'b'), format)).toBe('todo');
    expect(resultState(m('a', 'b', '6-4'), format)).toBe('invalid');
    expect(resultState(m('a', 'b', '6-4 6-5'), format)).toBe('invalid');
    expect(resultState(m('a', 'b', '6-4 6-2'), format)).toBe('done');
  });
});

describe('computeStandings', () => {
  it('counts wins, sets and games', () => {
    const rows = computeStandings(
      ['a', 'b', 'c'],
      [m('a', 'b', '6-2 6-3'), m('a', 'c', '6-4 3-6 4-6')],
      format,
    );

    // a and c: 1 win and sets +1 each; a has the better games difference (+4 against +3)
    expect(rows).toEqual([
      {
        pairId: 'a',
        played: 2,
        wins: 1,
        losses: 1,
        setsFor: 3,
        setsAgainst: 2,
        gamesFor: 25,
        gamesAgainst: 21,
      },
      {
        pairId: 'c',
        played: 1,
        wins: 1,
        losses: 0,
        setsFor: 2,
        setsAgainst: 1,
        gamesFor: 16,
        gamesAgainst: 13,
      },
      {
        pairId: 'b',
        played: 1,
        wins: 0,
        losses: 1,
        setsFor: 0,
        setsAgainst: 2,
        gamesFor: 5,
        gamesAgainst: 12,
      },
    ]);
  });

  it('keeps the initial order before any result', () => {
    expect(order(['a', 'b', 'c'], [m('a', 'b')])).toEqual(['a', 'b', 'c']);
  });

  it('ignores invalid and incomplete results', () => {
    expect(order(['a', 'b'], [m('b', 'a', '6-4')])).toEqual(['a', 'b']);
    expect(order(['a', 'b'], [m('b', 'a', '6-5 6-0')])).toEqual(['a', 'b']);
  });

  it('ranks by wins, then sets difference, then games difference', () => {
    // a and c: 1 win each. a won 2-0 and lost 1-2 (sets +1); c won 2-1 and lost 0-2 (sets -1)
    const bySets = [
      m('a', 'b', '6-4 6-4'),
      m('a', 'd', '6-0 4-6 5-7'),
      m('c', 'b', '0-6 7-5 7-5'),
      m('c', 'd', '0-6 0-6'),
    ];
    expect(order(['c', 'a', 'b', 'd'], bySets).slice(0, 3)).toEqual(['d', 'a', 'c']);

    // a and b: 1 win and sets +0 each; a has the better games difference
    const byGames = [m('a', 'c', '6-0 6-0'), m('a', 'b', '4-6 4-6'), m('b', 'c', '4-6 4-6')];
    expect(order(['b', 'a', 'c'], byGames)).toEqual(['a', 'b', 'c']);
  });

  it('breaks a two-way tie with the head-to-head, before games won and initial order', () => {
    // b and c: 1 win, sets -1 and games -2 each (c-d not played yet). b won more games
    // (26 against 24) and comes first, but c beat b
    const matches = [
      m('a', 'b', '6-0 6-0'),
      m('a', 'c', '6-4 6-4'),
      m('c', 'b', '6-4 4-6 6-4'),
      m('b', 'd', '6-0 6-0'),
    ];
    const rows = computeStandings(['a', 'b', 'c', 'd'], matches, format);
    const record = (id: string) => {
      const r = rows.find((row) => row.pairId === id)!;
      return [r.wins, r.setsFor - r.setsAgainst, r.gamesFor - r.gamesAgainst];
    };
    expect(record('b')).toEqual(record('c'));

    expect(rows.map((r) => r.pairId)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('breaks a three-way tie with games won, then initial order', () => {
    // Everyone 1 win, sets 2-2, games equal: initial order decides
    const matches = [
      m('a', 'b', '6-4 4-6 6-4'),
      m('b', 'c', '6-4 4-6 6-4'),
      m('c', 'a', '6-4 4-6 6-4'),
    ];
    expect(order(['a', 'b', 'c'], matches)).toEqual(['a', 'b', 'c']);
    expect(order(['b', 'a', 'c'], matches)).toEqual(['b', 'a', 'c']);
  });

  it('uses games won when two tied pairs have not played each other yet', () => {
    // a and b: 1 win 2-0 each, games difference +6 each; b won more games (13 against 12)
    const matches = [m('a', 'c', '6-3 6-3'), m('b', 'd', '7-5 6-2')];
    expect(order(['a', 'b', 'c', 'd'], matches)).toEqual(['b', 'a', 'd', 'c']);
  });
});
