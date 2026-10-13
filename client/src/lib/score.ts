/** Results set by set, written the usual way: '6-3 4-6 7-6(5)'. Side A first. */

export interface SetScore {
  a: number;
  b: number;
  /** Tie-break points, for a set won 7-6 */
  tiebreak?: { a: number; b: number };
}

/**
 * How a match is played (same rules as server/src/domain/score.ts): one set to 6, a pro set to
 * 9, or best of 3 or 5 sets (5 in tennis only) whose deciding set is a normal set, has its
 * tie-break at 6-6 played to 10 (`tiebreak10`), or is a super tie-break to 10 (`superTiebreak`).
 */
export interface MatchFormat {
  bestOf: number;
  gamesPerSet: number;
  decider: Decider;
}

export type Decider = 'set' | 'tiebreak10' | 'superTiebreak';
export const DECIDERS: Decider[] = ['set', 'tiebreak10', 'superTiebreak'];

/** How many sets, as chosen in the wizard. */
export type SetsChoice = 'bestOf3' | 'bestOf5' | 'oneSet' | 'proSet';
export const SETS_CHOICES: SetsChoice[] = ['bestOf3', 'bestOf5', 'oneSet', 'proSet'];

export function buildMatchFormat(sets: SetsChoice, decider: Decider): MatchFormat {
  switch (sets) {
    case 'oneSet':
      return { bestOf: 1, gamesPerSet: 6, decider: 'set' };
    case 'proSet':
      return { bestOf: 1, gamesPerSet: 9, decider: 'set' };
    default:
      return { bestOf: sets === 'bestOf5' ? 5 : 3, gamesPerSet: 6, decider };
  }
}

export function setsChoice(format: MatchFormat): SetsChoice {
  if (format.bestOf === 1) return format.gamesPerSet === 9 ? 'proSet' : 'oneSet';
  return format.bestOf === 5 ? 'bestOf5' : 'bestOf3';
}

/** 'third' or 'fifth': the set the decider applies to. */
export const decidingSet = (format: MatchFormat) => (format.bestOf === 5 ? 'fifth' : 'third');

/** An example result for the format, to show how to type one. */
export function exampleResult(format: MatchFormat): string {
  if (format.bestOf === 1) return format.gamesPerSet === 9 ? '9-7' : '6-4';
  const decider = { set: '7-6(5)', tiebreak10: '7-6(8)', superTiebreak: '10-8' }[format.decider];
  return [...(format.bestOf === 5 ? ['6-4', '3-6', '6-3', '4-6'] : ['6-4', '3-6']), decider].join(
    ' ',
  );
}

const TIEBREAK_POINTS = 7;
const LONG_TIEBREAK_POINTS = 10;

function tiebreakPoints(format: MatchFormat | undefined, index: number) {
  return format?.decider === 'tiebreak10' && index === format.bestOf - 1
    ? LONG_TIEBREAK_POINTS
    : TIEBREAK_POINTS;
}
const SET = /^(\d{1,2})-(\d{1,2})(?:\((\d{1,2})(?:-(\d{1,2}))?\))?$/;

/**
 * Reads a typed result. Sets are separated by spaces or commas; a tie-break goes in brackets,
 * either the loser's points ('7-6(5)': won 7-5) or both ('7-6(7-5)'). A super tie-break is
 * typed like a set ('10-8', also '[10-8]'). Empty text clears the result. With the match
 * format, '7-6(5)' in a deciding set with a tie-break to 10 reads as won 10-5. Whether the
 * result is valid for the format is checked by the server.
 */
export function parseResult(
  text: string,
  format?: MatchFormat,
): { sets: SetScore[] } | { unreadable: string } {
  const tokens = text
    .replace(/[–—:/]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s*\(\s*/g, '(')
    .replace(/\s*\)/g, ')')
    .replace(/[[\]]/g, '')
    .split(/[\s,;]+/)
    .filter(Boolean);

  const sets: SetScore[] = [];
  for (const token of tokens) {
    const match = SET.exec(token);
    if (!match) return { unreadable: token };
    const [a, b] = [Number(match[1]), Number(match[2])];
    if (match[3] === undefined) {
      sets.push({ a, b });
    } else if (match[4] !== undefined) {
      sets.push({ a, b, tiebreak: { a: Number(match[3]), b: Number(match[4]) } });
    } else {
      // '(5)': the points of whoever lost the set
      const loser = Number(match[3]);
      const winner = Math.max(tiebreakPoints(format, sets.length), loser + 2);
      sets.push({ a, b, tiebreak: a > b ? { a: winner, b: loser } : { a: loser, b: winner } });
    }
  }
  return { sets };
}

/** '6-3 4-6 7-6(5)': tie-breaks show the loser's points, like on a scoreboard. */
export function formatResult(sets: SetScore[]): string {
  return sets
    .map(({ a, b, tiebreak }) => {
      if (!tiebreak) return `${a}-${b}`;
      return `${a}-${b}(${Math.min(tiebreak.a, tiebreak.b)})`;
    })
    .join(' ');
}

/**
 * One side's games in each set, for a scoreboard: the tie-break points are shown on the side
 * that lost the set.
 */
export function sideGames(sets: SetScore[], side: 'a' | 'b') {
  const other = side === 'a' ? 'b' : 'a';
  return sets.map((set) => ({
    games: set[side],
    won: set[side] > set[other],
    tiebreak: set.tiebreak && set[side] < set[other] ? set.tiebreak[side] : undefined,
  }));
}
