import { describe, expect, it } from 'vitest';
import { distribute, roundRobin, shuffle } from '../../src/domain/groups.js';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

describe('distribute', () => {
  it('fills groups in order, larger groups first', () => {
    expect(distribute(ids(7), 3)).toEqual([
      ['p1', 'p2', 'p3'],
      ['p4', 'p5'],
      ['p6', 'p7'],
    ]);
  });
});

describe('shuffle', () => {
  it('keeps every item', () => {
    const items = ids(10);
    expect(shuffle(items).sort()).toEqual([...items].sort());
  });
});

describe('roundRobin', () => {
  it('plays a group of 3 like the prototype', () => {
    expect(roundRobin(['A1', 'A2', 'A3'])).toEqual([
      ['A1', 'A2'],
      ['A1', 'A3'],
      ['A2', 'A3'],
    ]);
  });

  it.each([2, 3, 4, 5, 6, 7])('plays every pair once in a group of %i', (n) => {
    const matches = roundRobin(ids(n));
    const keys = matches.map(([a, b]) => `${a}-${b}`);

    expect(matches).toHaveLength((n * (n - 1)) / 2);
    expect(new Set(keys).size).toBe(keys.length);
    // The pair listed first in the group is side A
    expect(matches.every(([a, b]) => Number(a.slice(1)) < Number(b.slice(1)))).toBe(true);
  });

  it('spreads the matches in rounds of 4 pairs', () => {
    expect(roundRobin(ids(4))).toEqual([
      ['p1', 'p4'],
      ['p2', 'p3'],
      ['p1', 'p3'],
      ['p2', 'p4'],
      ['p1', 'p2'],
      ['p3', 'p4'],
    ]);
  });
});
