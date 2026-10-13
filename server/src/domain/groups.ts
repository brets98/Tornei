import { groupSizes } from './setup.js';

/** Group ids in order: 'A', 'B', … */
export function groupId(index: number): string {
  return String.fromCharCode(65 + index);
}

/** Splits pairs into groups as evenly as possible, in order: the first pairs fill group A. */
export function distribute(pairIds: string[], groupCount: number): string[][] {
  let next = 0;
  return groupSizes(pairIds.length, groupCount).map((size) => {
    const group = pairIds.slice(next, next + size);
    next += size;
    return group;
  });
}

/** Fisher–Yates shuffle; `random` returns a number in [0, 1), like Math.random. */
export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Every pair against every other once, ordered by rounds (circle method) so nobody plays
 * twice in a row when avoidable. In each match the pair listed first in the group is side A.
 */
export function roundRobin(pairIds: string[]): [string, string][] {
  // With an odd count, a dummy at the fixed position gives one pair per round a rest
  const ring: (string | null)[] = pairIds.length % 2 ? [null, ...pairIds] : [...pairIds];
  const n = ring.length;
  const order = (id: string) => pairIds.indexOf(id);
  const matches: [string, string][] = [];

  for (let round = 0; round < n - 1; round++) {
    for (let i = 0; i < n / 2; i++) {
      const a = ring[i];
      const b = ring[n - 1 - i];
      if (a && b) matches.push(order(a) < order(b) ? [a, b] : [b, a]);
    }
    ring.splice(1, 0, ring.pop()!);
  }
  return matches;
}
