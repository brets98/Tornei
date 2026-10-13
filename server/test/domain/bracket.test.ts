import { describe, expect, it } from 'vitest';
import { bracketMatches, placeSeeds, standardOrder } from '../../src/domain/bracket.js';

/** Seeds from groups, strongest first: A1, B1, …, A2, B2, … */
function groupSeeds(groups: string, positions: number[]) {
  return positions.flatMap((tier) =>
    [...groups].map((group) => ({ group, tier, label: `${group}${tier}` })),
  );
}

const labels = (slots: ({ label: string } | null)[]) => slots.map((s) => s?.label ?? 'bye');

/** First round in which slots i and j could meet (0 = first round). */
const meetingRound = (i: number, j: number) => Math.floor(Math.log2(i ^ j));

/** For each group, the round in which its entrants could first meet. */
function sameGroupMeetings(slots: ({ group?: string } | null)[]) {
  const rounds: number[] = [];
  slots.forEach((a, i) =>
    slots.forEach((b, j) => {
      if (i < j && a?.group && a.group === b?.group) rounds.push(meetingRound(i, j));
    }),
  );
  return rounds;
}

describe('standardOrder', () => {
  it('keeps the top seeds apart', () => {
    expect(standardOrder(2)).toEqual([0, 1]);
    expect(standardOrder(4)).toEqual([0, 3, 1, 2]);
    expect(standardOrder(8)).toEqual([0, 7, 3, 4, 1, 6, 2, 5]);
  });
});

describe('placeSeeds', () => {
  it('needs at least 2 entrants', () => {
    expect(() => placeSeeds([{ tier: 0 }])).toThrow();
  });

  it('pairs 4 groups × 2 so same-group pairs can only meet in the final', () => {
    const slots = placeSeeds(groupSeeds('ABCD', [1, 2]));

    expect(labels(slots)).toEqual(['A1', 'C2', 'D1', 'B2', 'B1', 'D2', 'C1', 'A2']);
    expect(sameGroupMeetings(slots)).toEqual([2, 2, 2, 2]);
  });

  it('pairs the third places of 4 groups by seed (bracket B of the prototype)', () => {
    expect(labels(placeSeeds(groupSeeds('ABCD', [3])))).toEqual(['A3', 'D3', 'B3', 'C3']);
  });

  it('gives byes to the top seeds, by group letter', () => {
    // 3 groups × 2 = 6 entrants in a bracket of 8: A1 and B1 skip the first round
    const slots = placeSeeds(groupSeeds('ABC', [1, 2]));

    expect(labels(slots)).toEqual(['A1', 'bye', 'C2', 'B2', 'B1', 'bye', 'C1', 'A2']);
    // Nobody meets their own group in the first round
    expect(Math.min(...sameGroupMeetings(slots))).toBeGreaterThan(0);
  });

  it.each([
    [2, 1],
    [3, 2],
    [5, 2],
    [6, 2],
    [3, 3],
    [8, 2],
  ])('never pairs same-group entrants in the first round (%i groups × %i)', (groups, perGroup) => {
    const letters = 'ABCDEFGH'.slice(0, groups);
    const seeds = groupSeeds(
      letters,
      Array.from({ length: perGroup }, (_, i) => i + 1),
    );
    const slots = placeSeeds(seeds);
    const byes = slots.length - seeds.length;

    expect(slots.filter(Boolean)).toHaveLength(seeds.length);
    if (groups > 1) expect(Math.min(...sameGroupMeetings(slots))).toBeGreaterThan(0);
    // Byes go to the strongest seeds only
    const withBye = slots.filter((s, i) => s && slots[i ^ 1] === null);
    expect(withBye.map((s) => s!.label).sort()).toEqual(
      seeds
        .slice(0, byes)
        .map((s) => s.label)
        .sort(),
    );
  });

  it('keeps entry order for a knockout without groups', () => {
    const seeds = ['s1', 's2', 's3', 's4', 's5'].map((label) => ({ tier: 0, label }));

    expect(labels(placeSeeds(seeds))).toEqual(['s1', 'bye', 's4', 's5', 's2', 'bye', 's3', 'bye']);
  });
});

describe('bracketMatches', () => {
  it('builds every round, with byes and winners feeding the next round', () => {
    const matches = bracketMatches('A', [
      { kind: 'seed', index: 0 },
      null,
      { kind: 'seed', index: 1 },
      { kind: 'seed', index: 2 },
    ]);

    expect(matches.map((m) => [m.id, m.sourceA, m.sourceB])).toEqual([
      ['A0-0', { kind: 'seed', index: 0 }, { kind: 'bye' }],
      ['A0-1', { kind: 'seed', index: 1 }, { kind: 'seed', index: 2 }],
      ['A1-0', { kind: 'winner', matchId: 'A0-0' }, { kind: 'winner', matchId: 'A0-1' }],
    ]);
  });
});
