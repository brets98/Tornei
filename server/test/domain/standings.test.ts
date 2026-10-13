import { describe, expect, it } from 'vitest';
import { computeStandings, scoreState } from '../../src/domain/standings.js';

const m = (pairA: string, pairB: string, scoreA: number | null, scoreB: number | null) => ({
  pairA,
  pairB,
  scoreA,
  scoreB,
});
const order = (pairIds: string[], matches: ReturnType<typeof m>[]) =>
  computeStandings(pairIds, matches).map((r) => r.pairId);

describe('scoreState', () => {
  it('is done only with two different scores', () => {
    expect(scoreState(m('a', 'b', 6, null))).toBe('todo');
    expect(scoreState(m('a', 'b', 6, 6))).toBe('invalid');
    expect(scoreState(m('a', 'b', 0, 6))).toBe('done');
  });
});

describe('computeStandings', () => {
  it('counts wins, losses and games', () => {
    const rows = computeStandings(['a', 'b', 'c'], [m('a', 'b', 6, 2), m('a', 'c', 3, 6)]);

    expect(rows).toEqual([
      { pairId: 'c', played: 1, wins: 1, losses: 0, gamesFor: 6, gamesAgainst: 3 },
      { pairId: 'a', played: 2, wins: 1, losses: 1, gamesFor: 9, gamesAgainst: 8 },
      { pairId: 'b', played: 1, wins: 0, losses: 1, gamesFor: 2, gamesAgainst: 6 },
    ]);
  });

  it('keeps the initial order before any result', () => {
    expect(order(['a', 'b', 'c'], [m('a', 'b', null, null)])).toEqual(['a', 'b', 'c']);
  });

  it('ignores invalid and incomplete scores', () => {
    expect(order(['a', 'b'], [m('a', 'b', 4, 4)])).toEqual(['a', 'b']);
    expect(order(['a', 'b'], [m('a', 'b', null, 6)])).toEqual(['a', 'b']);
  });

  it('ranks by wins, then games difference', () => {
    const matches = [m('a', 'b', 6, 4), m('a', 'c', 6, 0), m('b', 'c', 2, 6), m('c', 'd', 6, 1)];
    // a: 2 wins; c: 2 wins (diff 12-9=+3) — a diff +8; b and d: 0 wins, b -6, d -5
    expect(order(['a', 'b', 'c', 'd'], matches)).toEqual(['a', 'c', 'd', 'b']);
  });

  it('breaks a two-way tie with the head-to-head, before games won and initial order', () => {
    // b and c: 1 win and difference -1 each; b won more games and comes first, but c beat b
    const matches = [
      m('a', 'b', 8, 5),
      m('a', 'c', 6, 5),
      m('a', 'd', 6, 0),
      m('b', 'c', 4, 6),
      m('b', 'd', 7, 3),
      m('c', 'd', 4, 6),
    ];

    expect(order(['a', 'b', 'c', 'd'], matches)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('breaks a three-way tie with games won, then initial order', () => {
    // Everyone 1 win, difference 0: a 12 games, b 12 games, c 10 games
    const matches = [m('a', 'b', 6, 4), m('b', 'c', 6, 4), m('c', 'a', 6, 4)];
    expect(order(['a', 'b', 'c'], matches)).toEqual(['a', 'b', 'c']);
    expect(order(['b', 'a', 'c'], matches)).toEqual(['b', 'a', 'c']);

    const unequal = [m('a', 'b', 6, 4), m('b', 'c', 7, 5), m('c', 'a', 6, 4)];
    // b 11 games, c 11, a 10 → b, c (initial order), a
    expect(order(['a', 'b', 'c'], unequal)).toEqual(['b', 'c', 'a']);
  });

  it('uses games won when two tied pairs have not played each other yet', () => {
    const matches = [m('a', 'c', 6, 2), m('b', 'd', 7, 3)];
    expect(order(['a', 'b', 'c', 'd'], matches)).toEqual(['b', 'a', 'd', 'c']);
  });
});
