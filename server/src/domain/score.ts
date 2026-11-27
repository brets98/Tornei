import type { Issue } from './setup.js';
import type { Match, MatchFormat, SetScore, TournamentData } from './types.js';

/** Common match formats, for tests and scripts. Any valid combination can be chosen. */
export const MATCH_FORMATS = {
  /** Best of 3 sets to 6, tie-break at 6-6 */
  bestOf3: { bestOf: 3, gamesPerSet: 6, decider: 'set' },
  /** Best of 3 sets to 6, the third set is a super tie-break to 10 (common in padel) */
  bestOf3SuperTiebreak: { bestOf: 3, gamesPerSet: 6, decider: 'superTiebreak' },
  /** Best of 5 sets to 6, tie-break at 6-6 */
  bestOf5: { bestOf: 5, gamesPerSet: 6, decider: 'set' },
  /** Best of 5 sets, the fifth set's tie-break at 6-6 is played to 10 (Grand Slams) */
  bestOf5Tiebreak10: { bestOf: 5, gamesPerSet: 6, decider: 'tiebreak10' },
  /** One set to 6, tie-break at 6-6 */
  oneSet: { bestOf: 1, gamesPerSet: 6, decider: 'set' },
  /** One set to 9, tie-break at 8-8 */
  proSet: { bestOf: 1, gamesPerSet: 9, decider: 'set' },
  /** One set to 6, tie-break at 5-5: 6-4 or 6-5 after the tie-break */
  shortSet: { bestOf: 1, gamesPerSet: 6, decider: 'set', tiebreakAt: 5 },
} as const satisfies Record<string, MatchFormat>;

export const DEFAULT_MATCH_FORMAT: MatchFormat = MATCH_FORMATS.bestOf3;

export const DECIDERS = ['set', 'tiebreak10', 'superTiebreak'] as const;

/**
 * One set to 6 (tie-break at 6-6, or at 5-5 with `tiebreakAt: 5`) or a pro set to 9; or best of
 * 3 or 5 sets to 6, whose deciding set can have its
 * tie-break played to 10 or be replaced by a super tie-break to 10. Best of 5 is tennis only.
 */
export function isValidMatchFormat(format: unknown): format is MatchFormat {
  const f = format as Partial<MatchFormat> | null;
  if (!f || typeof f !== 'object') return false;
  if (f.tiebreakAt !== undefined && f.tiebreakAt !== null) {
    return f.tiebreakAt === 5 && f.bestOf === 1 && f.gamesPerSet === 6 && f.decider === 'set';
  }
  if (f.bestOf === 1) return (f.gamesPerSet === 6 || f.gamesPerSet === 9) && f.decider === 'set';
  return (
    (f.bestOf === 3 || f.bestOf === 5) &&
    f.gamesPerSet === 6 &&
    (DECIDERS as readonly unknown[]).includes(f.decider)
  );
}

/** How a match is played: group matches can have their own format. */
export function formatOf(
  data: Pick<TournamentData, 'matchFormat' | 'groupMatchFormat'>,
  match: Pick<Match, 'phase'>,
): MatchFormat {
  return (match.phase === 'group' && data.groupMatchFormat) || data.matchFormat;
}

export function sameFormat(a?: MatchFormat | null, b?: MatchFormat | null): boolean {
  if (!a || !b) return !a && !b;
  return (
    a.bestOf === b.bestOf &&
    a.gamesPerSet === b.gamesPerSet &&
    a.decider === b.decider &&
    (a.tiebreakAt ?? null) === (b.tiebreakAt ?? null)
  );
}

/** Highest number accepted for games or points, to catch typing mistakes. */
const MAX_NUMBER = 99;
const SUPER_TIEBREAK_POINTS = 10;
const TIEBREAK_POINTS = 7;
const LONG_TIEBREAK_POINTS = 10;

/** Points a set's tie-break is played to: 7, or 10 in a deciding set that says so. */
export function tiebreakPoints(format: MatchFormat, index: number) {
  return format.decider === 'tiebreak10' && index === format.bestOf - 1
    ? LONG_TIEBREAK_POINTS
    : TIEBREAK_POINTS;
}

/** Games at which a set goes to a tie-break: 6-6 (to 6), 8-8 (pro set to 9), or 5-5 if said. */
function tiebreakAt(format: MatchFormat) {
  return format.tiebreakAt ?? (format.gamesPerSet === 9 ? 8 : format.gamesPerSet);
}

/** Won "to `target`, by 2": 7-5, 10-8, or any longer win by exactly 2 (9-7, 12-10). */
function isRaceWon(winner: number, loser: number, target: number) {
  return winner === target ? loser <= target - 2 : winner > target && loser === winner - 2;
}

const isCount = (n: unknown): n is number =>
  Number.isInteger(n) && (n as number) >= 0 && (n as number) <= MAX_NUMBER;

/** Whether the set at `index` is a super tie-break instead of a set. */
export function isSuperTiebreak(format: MatchFormat, index: number) {
  return format.decider === 'superTiebreak' && index === format.bestOf - 1;
}

/** Why one set isn't valid, or null. */
function checkSet(set: SetScore, format: MatchFormat, index: number): string | null {
  const [winner, loser] = set.a > set.b ? [set.a, set.b] : [set.b, set.a];
  if (winner === loser) return 'SCORE_SET_TIED';

  if (isSuperTiebreak(format, index)) {
    if (set.tiebreak) return 'SCORE_SUPER_TIEBREAK_INVALID';
    return isRaceWon(winner, loser, SUPER_TIEBREAK_POINTS) ? null : 'SCORE_SUPER_TIEBREAK_INVALID';
  }

  const games = format.gamesPerSet;
  const at = tiebreakAt(format);
  const isTiebreakSet = winner === at + 1 && loser === at;
  const isPlainSet =
    (winner === games && loser <= games - 2) ||
    // 7-5: from 5-5 a set to 6 goes on to 7 (not in a pro set, where 8-8 is the tie-break, nor
    // when the tie-break comes at 5-5)
    (at === games && winner === games + 1 && loser === games - 1);
  if (!isTiebreakSet && !isPlainSet) {
    return format.tiebreakAt ? 'SCORE_SHORT_SET_INVALID' : 'SCORE_SET_INVALID';
  }

  if (set.tiebreak) {
    if (!isTiebreakSet) return 'SCORE_TIEBREAK_NOT_PLAYED';
    const { a, b } = set.tiebreak;
    // The set's winner must have won the tie-break, to 7 (or 10) by 2
    const [tw, tl] = set.a > set.b ? [a, b] : [b, a];
    if (!isRaceWon(tw, tl, tiebreakPoints(format, index))) return 'SCORE_TIEBREAK_INVALID';
  }
  return null;
}

/**
 * Why a result isn't valid for the match format, or null if it is (an empty result is valid:
 * it clears the match). Tie-break points are optional; when given they must be right.
 */
export function checkSets(sets: unknown, format: MatchFormat): Issue | null {
  if (!Array.isArray(sets)) return { code: 'SCORE_MALFORMED' };
  if (sets.length === 0) return null;

  const needed = Math.ceil(format.bestOf / 2);
  let [wonA, wonB] = [0, 0];
  for (const [index, raw] of sets.entries()) {
    const set = raw as SetScore;
    const tiebreak = set?.tiebreak;
    if (
      !isCount(set?.a) ||
      !isCount(set?.b) ||
      (tiebreak !== undefined &&
        tiebreak !== null &&
        (!isCount(tiebreak.a) || !isCount(tiebreak.b)))
    ) {
      return { code: 'SCORE_MALFORMED' };
    }
    if (wonA === needed || wonB === needed) return { code: 'SCORE_TOO_MANY_SETS' };

    const problem = checkSet(
      { a: set.a, b: set.b, tiebreak: tiebreak ?? undefined },
      format,
      index,
    );
    if (problem) {
      return {
        code: problem,
        params: {
          set: index + 1,
          games: format.gamesPerSet,
          points: tiebreakPoints(format, index),
        },
      };
    }
    if (set.a > set.b) wonA++;
    else wonB++;
  }
  if (wonA < needed && wonB < needed) return { code: 'SCORE_INCOMPLETE' };
  return null;
}

export interface Outcome {
  winner: 'A' | 'B';
  setsA: number;
  setsB: number;
  /** A super tie-break counts as a set, and as one game to its winner */
  gamesA: number;
  gamesB: number;
}

/** Sets and games won by each side of a valid, complete result. */
export function outcome(sets: SetScore[], format: MatchFormat): Outcome {
  const result = { setsA: 0, setsB: 0, gamesA: 0, gamesB: 0 };
  sets.forEach((set, index) => {
    const aWon = set.a > set.b;
    if (aWon) result.setsA++;
    else result.setsB++;
    if (isSuperTiebreak(format, index)) {
      if (aWon) result.gamesA++;
      else result.gamesB++;
    } else {
      result.gamesA += set.a;
      result.gamesB += set.b;
    }
  });
  return { ...result, winner: result.setsA > result.setsB ? 'A' : 'B' };
}

/** Keeps only the fields of a set (drops an empty tie-break). */
export function cleanSets(sets: SetScore[]): SetScore[] {
  return sets.map(({ a, b, tiebreak }) =>
    tiebreak ? { a, b, tiebreak: { a: tiebreak.a, b: tiebreak.b } } : { a, b },
  );
}
