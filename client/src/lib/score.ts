/** Results set by set, written the usual way: '6-3 4-6 7-6(5)'. Side A first. */

export interface SetScore {
  a: number;
  b: number;
  /** Tie-break points, for a set won 7-6 */
  tiebreak?: { a: number; b: number };
}

export interface MatchFormat {
  bestOf: number;
  gamesPerSet: number;
  decider: 'set' | 'superTiebreak';
}

/** The formats a tournament can choose; same list as server/src/domain/score.ts. */
export const MATCH_FORMATS = {
  bestOf3: { bestOf: 3, gamesPerSet: 6, decider: 'set' },
  bestOf3SuperTiebreak: { bestOf: 3, gamesPerSet: 6, decider: 'superTiebreak' },
  oneSet: { bestOf: 1, gamesPerSet: 6, decider: 'set' },
  proSet: { bestOf: 1, gamesPerSet: 9, decider: 'set' },
} as const satisfies Record<string, MatchFormat>;

export type MatchFormatId = keyof typeof MATCH_FORMATS;

export function matchFormatId(format: MatchFormat): MatchFormatId | undefined {
  return (Object.keys(MATCH_FORMATS) as MatchFormatId[]).find((id) => {
    const known = MATCH_FORMATS[id];
    return (
      known.bestOf === format.bestOf &&
      known.gamesPerSet === format.gamesPerSet &&
      known.decider === format.decider
    );
  });
}

/** An example result for the format, to show how to type one. */
export function exampleResult(format: MatchFormat): string {
  switch (matchFormatId(format)) {
    case 'bestOf3SuperTiebreak':
      return '6-4 3-6 10-8';
    case 'oneSet':
      return '6-4';
    case 'proSet':
      return '9-7';
    default:
      return '6-4 3-6 7-6(5)';
  }
}

const TIEBREAK_POINTS = 7;
const SET = /^(\d{1,2})-(\d{1,2})(?:\((\d{1,2})(?:-(\d{1,2}))?\))?$/;

/**
 * Reads a typed result. Sets are separated by spaces or commas; a tie-break goes in brackets,
 * either the loser's points ('7-6(5)': won 7-5) or both ('7-6(7-5)'). A super tie-break is
 * typed like a set ('10-8', also '[10-8]'). Empty text clears the result. Whether the result
 * is valid for the match format is checked by the server.
 */
export function parseResult(text: string): { sets: SetScore[] } | { unreadable: string } {
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
      const winner = Math.max(TIEBREAK_POINTS, loser + 2);
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
