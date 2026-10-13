import type { MatchState, StandingRow } from './types.js';

export interface ScoredMatch {
  pairA: string | null;
  pairB: string | null;
  scoreA: number | null;
  scoreB: number | null;
}

/** todo until both scores are entered; equal scores are invalid (no draws). */
export function scoreState({
  scoreA,
  scoreB,
}: ScoredMatch): Extract<MatchState, 'todo' | 'done' | 'invalid'> {
  if (scoreA === null || scoreB === null) return 'todo';
  return scoreA === scoreB ? 'invalid' : 'done';
}

const diff = (row: StandingRow) => row.gamesFor - row.gamesAgainst;

/**
 * Ranks a group: wins → games difference → head-to-head (only between exactly two tied
 * pairs) → games won → initial order (`pairIds`). Only done matches count.
 */
export function computeStandings(pairIds: string[], matches: ScoredMatch[]): StandingRow[] {
  const rows = new Map<string, StandingRow>(
    pairIds.map((pairId) => [
      pairId,
      { pairId, played: 0, wins: 0, losses: 0, gamesFor: 0, gamesAgainst: 0 },
    ]),
  );
  const played = matches.filter(
    (m) => scoreState(m) === 'done' && rows.has(m.pairA!) && rows.has(m.pairB!),
  );

  for (const m of played) {
    const sides = [
      [rows.get(m.pairA!)!, m.scoreA!, m.scoreB!],
      [rows.get(m.pairB!)!, m.scoreB!, m.scoreA!],
    ] as const;
    for (const [row, own, other] of sides) {
      row.played++;
      row.gamesFor += own;
      row.gamesAgainst += other;
      if (own > other) row.wins++;
      else row.losses++;
    }
  }

  const beat = (a: string, b: string) =>
    played.some(
      (m) =>
        (m.pairA === a && m.pairB === b && m.scoreA! > m.scoreB!) ||
        (m.pairA === b && m.pairB === a && m.scoreB! > m.scoreA!),
    );
  const initial = (row: StandingRow) => pairIds.indexOf(row.pairId);
  const byWinsAndDiff = (a: StandingRow, b: StandingRow) => b.wins - a.wins || diff(b) - diff(a);

  const ranked = [...rows.values()].sort(byWinsAndDiff);
  const result: StandingRow[] = [];
  for (let start = 0; start < ranked.length;) {
    let end = start + 1;
    while (end < ranked.length && byWinsAndDiff(ranked[start], ranked[end]) === 0) end++;
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
