/** A valid wizard body: the prototype tournament (12 pairs in 4 groups, brackets A and B). */
export const validSetup = {
  name: '  Torneo di primavera ',
  subtitle: 'Gironi',
  sport: 'padel',
  format: 'doubles',
  date: '2026-10-20',
  pairCount: 12,
  courts: ['Bigi', 'Mediolanum'],
  timeSlots: ['20:00', '9:30', '19:00'],
  structure: { type: 'groups_knockout', groupCount: 4, advanceA: 2, advanceB: 1 },
};

/**
 * Sets from the usual notation, side A first: '6-4 3-6 7-6(5)'. '(5)' is the tie-break
 * loser's points (the winner has 7, or 2 more beyond 5); '10-8' as a decider is a super tie-break.
 */
export function sets(text: string) {
  return text
    .split(' ')
    .filter(Boolean)
    .map((set) => {
      const [, a, b, tb] = /^(\d+)-(\d+)(?:\((\d+)\))?$/.exec(set)!;
      const [ga, gb] = [Number(a), Number(b)];
      if (tb === undefined) return { a: ga, b: gb };
      const loser = Number(tb);
      const winner = Math.max(7, loser + 2);
      return {
        a: ga,
        b: gb,
        tiebreak: ga > gb ? { a: winner, b: loser } : { a: loser, b: winner },
      };
    });
}
