import type { BracketId, Match, Source } from './types.js';

export function nextPowerOfTwo(n: number): number {
  let size = 1;
  while (size < n) size *= 2;
  return size;
}

/**
 * Seed number (0-based) for each slot of a bracket of `size` slots, where slots 2i and 2i+1
 * play match i: seed 0 meets the last, 0 and 1 can only meet in the final, and so on.
 * size 8 → [0, 7, 3, 4, 1, 6, 2, 5].
 */
export function standardOrder(size: number): number[] {
  let order = [0];
  while (order.length < size) {
    const length = order.length * 2;
    order = order.flatMap((seed) => [seed, length - 1 - seed]);
  }
  return order;
}

export interface Seed {
  /** Entrants of the same group should meet as late as possible */
  group?: string;
  /** Entrants of the same tier (e.g. all group winners) are interchangeable */
  tier: number;
}

/** First round (0-based) in which slots i and j could meet. */
function meetingRound(i: number, j: number) {
  return Math.floor(Math.log2(i ^ j));
}

/** Same-group meetings per round: lower is better, comparing earlier rounds first. */
function conflicts(slots: (Seed | null)[], rounds: number): number[] {
  const cost = new Array<number>(rounds).fill(0);
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const [a, b] = [slots[i], slots[j]];
      if (a?.group !== undefined && a.group === b?.group) cost[meetingRound(i, j)]++;
    }
  }
  return cost;
}

function isBetter(cost: number[], than: number[]) {
  const i = cost.findIndex((c, k) => c !== than[k]);
  return i !== -1 && cost[i] < than[i];
}

/**
 * Places seeds (strongest first) in a bracket of the next power of 2 slots; `null` slots
 * are byes, which go to the top seeds. Starts from the standard order, then swaps entrants
 * of the same tier (and with/without a bye alike) so same-group entrants meet as late as
 * possible. Deterministic.
 */
export function placeSeeds<T extends Seed>(seeds: T[]): (T | null)[] {
  if (seeds.length < 2) throw new Error('A bracket needs at least 2 entrants');
  const size = nextPowerOfTwo(seeds.length);
  const rounds = Math.log2(size);
  const slots = standardOrder(size).map((seed) => seeds[seed] ?? null);
  if (!seeds.some((s) => s.group !== undefined)) return slots;

  // Swaps keep the tier and who has a bye; weaker tiers move first, so top seeds stay put
  const hasBye = (slot: number) => slots[slot ^ 1] === null;
  const swaps: [number, number][] = [];
  for (let i = 0; i < size; i++) {
    for (let j = i + 1; j < size; j++) {
      const [a, b] = [slots[i], slots[j]];
      if (a && b && a.tier === b.tier && hasBye(i) === hasBye(j)) swaps.push([i, j]);
    }
  }
  swaps.sort(([a], [b]) => slots[b]!.tier - slots[a]!.tier);

  let cost = conflicts(slots, rounds);
  let improved = true;
  while (improved) {
    improved = false;
    for (const [i, j] of swaps) {
      [slots[i], slots[j]] = [slots[j], slots[i]];
      const swapped = conflicts(slots, rounds);
      if (isBetter(swapped, cost)) {
        cost = swapped;
        improved = true;
      } else {
        [slots[i], slots[j]] = [slots[j], slots[i]];
      }
    }
  }
  return slots;
}

export function knockoutMatchId(bracket: BracketId, round: number, index: number) {
  return `${bracket}${round}-${index}`;
}

/** Every match of a bracket, from the first round to the final, with where each side comes from. */
export function bracketMatches(bracket: BracketId, slots: (Source | null)[]): Match[] {
  const matches: Match[] = [];
  const rounds = Math.log2(slots.length);
  for (let round = 0; round < rounds; round++) {
    const count = slots.length / 2 ** (round + 1);
    for (let index = 0; index < count; index++) {
      const [sourceA, sourceB]: Source[] =
        round === 0
          ? [slots[2 * index] ?? { kind: 'bye' }, slots[2 * index + 1] ?? { kind: 'bye' }]
          : [0, 1].map((k) => ({
              kind: 'winner' as const,
              matchId: knockoutMatchId(bracket, round - 1, 2 * index + k),
            }));
      matches.push({
        id: knockoutMatchId(bracket, round, index),
        phase: 'knockout',
        bracket,
        round,
        index,
        sourceA,
        sourceB,
        pairA: null,
        pairB: null,
        sets: [],
        scoredPairs: [],
        courtId: null,
        timeSlotId: null,
        state: 'todo',
        winner: null,
      });
    }
  }
  return matches;
}
