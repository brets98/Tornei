import { checkSets, outcome } from './score.js';
import type { MatchFormat, MatchState, SetScore, StandingRow } from './types.js';

export interface ScoredMatch {
  pairA: string | null;
  pairB: string | null;
  sets: SetScore[];
}

/** todo until a result is entered; a result not valid for the format is invalid. */
export function resultState(
  { sets }: Pick<ScoredMatch, 'sets'>,
  format: MatchFormat,
): Extract<MatchState, 'todo' | 'done' | 'invalid'> {
  if (sets.length === 0) return 'todo';
  return checkSets(sets, format) ? 'invalid' : 'done';
}

const setDiff = (row: StandingRow) => row.setsFor - row.setsAgainst;
const gameDiff = (row: StandingRow) => row.gamesFor - row.gamesAgainst;

/**
 * Ranks a group: wins → sets difference → games difference → head-to-head (only between
 * exactly two tied pairs) → games won → initial order (`pairIds`). Only done matches count.
 */
export function computeStandings(
  pairIds: string[],
  matches: ScoredMatch[],
  format: MatchFormat,
): StandingRow[] {
  const rows = new Map<string, StandingRow>(
    pairIds.map((pairId) => [
      pairId,
      {
        pairId,
        played: 0,
        wins: 0,
        losses: 0,
        setsFor: 0,
        setsAgainst: 0,
        gamesFor: 0,
        gamesAgainst: 0,
      },
    ]),
  );
  const played = matches
    .filter((m) => resultState(m, format) === 'done' && rows.has(m.pairA!) && rows.has(m.pairB!))
    .map((m) => ({ ...m, outcome: outcome(m.sets, format) }));

  for (const { pairA, pairB, outcome: o } of played) {
    const sides = [
      [rows.get(pairA!)!, o.winner === 'A', o.setsA, o.setsB, o.gamesA, o.gamesB],
      [rows.get(pairB!)!, o.winner === 'B', o.setsB, o.setsA, o.gamesB, o.gamesA],
    ] as const;
    for (const [row, won, setsFor, setsAgainst, gamesFor, gamesAgainst] of sides) {
      row.played++;
      if (won) row.wins++;
      else row.losses++;
      row.setsFor += setsFor;
      row.setsAgainst += setsAgainst;
      row.gamesFor += gamesFor;
      row.gamesAgainst += gamesAgainst;
    }
  }

  const beat = (a: string, b: string) =>
    played.some(
      (m) =>
        (m.pairA === a && m.pairB === b && m.outcome.winner === 'A') ||
        (m.pairA === b && m.pairB === a && m.outcome.winner === 'B'),
    );
  const initial = (row: StandingRow) => pairIds.indexOf(row.pairId);
  const byRecord = (a: StandingRow, b: StandingRow) =>
    b.wins - a.wins || setDiff(b) - setDiff(a) || gameDiff(b) - gameDiff(a);

  const ranked = [...rows.values()].sort(byRecord);
  const result: StandingRow[] = [];
  for (let start = 0; start < ranked.length;) {
    let end = start + 1;
    while (end < ranked.length && byRecord(ranked[start], ranked[end]) === 0) end++;
    const tied = ranked.slice(start, end);

    if (tied.length === 2 && beat(tied[1].pairId, tied[0].pairId)) {
      tied.reverse();
    } else if (!(tied.length === 2 && beat(tied[0].pairId, tied[1].pairId))) {
      tied.sort((a, b) => b.gamesFor - a.gamesFor || initial(a) - initial(b));
    }
    result.push(...tied);
    start = end;
  }
  return result;
}

/**
 * Pairs at `position` across groups, best first: wins → sets difference → games difference →
 * games won → group letter. Groups larger than the smallest one leave out the matches against
 * their pairs ranked below the smallest size (e.g. the 4th of a group of 4 when the others
 * have 3), so every pair is compared on the same number of matches. Groups must be complete.
 */
export function rankAcross(
  groups: { id: string; pairIds: string[]; standings: StandingRow[] }[],
  matches: (ScoredMatch & { groupId?: string })[],
  format: MatchFormat,
  position: number,
): { pairId: string; groupId: string }[] {
  const smallest = Math.min(...groups.map((g) => g.pairIds.length));
  const rows = groups
    .filter((g) => g.standings.length >= position)
    .map((g) => {
      const counted = g.standings.slice(0, smallest).map((row) => row.pairId);
      const own = matches.filter((m) => m.groupId === g.id);
      const pairId = g.standings[position - 1].pairId;
      // A pair below the smallest size is compared on its matches against the counted ones
      const pairIds = counted.includes(pairId) ? counted : [...counted, pairId];
      const row = computeStandings(pairIds, own, format).find((r) => r.pairId === pairId)!;
      return { row, groupId: g.id };
    });
  return rows
    .sort(
      (a, b) =>
        b.row.wins - a.row.wins ||
        setDiff(b.row) - setDiff(a.row) ||
        gameDiff(b.row) - gameDiff(a.row) ||
        b.row.gamesFor - a.row.gamesFor ||
        a.groupId.localeCompare(b.groupId),
    )
    .map(({ row, groupId }) => ({ pairId: row.pairId, groupId }));
}
