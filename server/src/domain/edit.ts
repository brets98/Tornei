import { shuffle } from './groups.js';
import { checkGroups, LIMITS, type Issue } from './setup.js';
import { buildMatches, refreshTournament } from './tournament.js';
import type { TournamentData } from './types.js';

/** Highest score accepted for one side (games, no sets). */
export const MAX_SCORE = 99;

/** The edited tournament, refreshed; or why the edit can't be done. `NOT_FOUND`: unknown pair/match. */
export type EditResult =
  { data: TournamentData; issues?: never } | { data?: never; issues: Issue[] };

const fail = (code: string, params?: Issue['params']): EditResult => ({
  issues: [params ? { code, params } : { code }],
});

/** Groups and draw can change only until any score is entered. */
export function hasResults(data: TournamentData) {
  return data.matches.some((m) => m.scoreA !== null || m.scoreB !== null);
}

/** New groups or seeding: regenerate the matches, keeping courts and times of those that remain. */
function restructure(data: TournamentData, changes: Partial<TournamentData>): EditResult {
  const next = { ...data, ...changes };
  return { data: refreshTournament({ ...next, ...buildMatches(next) }) };
}

export function setPlayers(data: TournamentData, pairId: string, players: unknown): EditResult {
  const pair = data.pairs.find((p) => p.id === pairId);
  if (!pair) return fail('NOT_FOUND');

  const count = data.format === 'singles' ? 1 : 2;
  const names = Array.isArray(players) ? players : [];
  if (
    names.length !== count ||
    names.some((n) => typeof n !== 'string' || n.trim().length > LIMITS.playerNameLength)
  ) {
    return fail('PLAYERS_INVALID', { max: LIMITS.playerNameLength });
  }

  const pairs = data.pairs.map((p) =>
    p.id === pairId ? { ...p, players: names.map((n: string) => n.trim()) } : p,
  );
  return { data: refreshTournament({ ...data, pairs }) };
}

/**
 * Moves pairs between groups (or reorders them: the order is the last tie-break).
 * `groups` lists every group, each pair exactly once.
 */
export function setGroups(data: TournamentData, groups: unknown): EditResult {
  if (hasResults(data)) return fail('STRUCTURE_LOCKED');

  const list = Array.isArray(groups) ? (groups as { id?: unknown; pairIds?: unknown }[]) : [];
  const assigned = list.flatMap((g) => (Array.isArray(g?.pairIds) ? g.pairIds : []));
  const valid =
    data.groups.length > 0 &&
    list.length === data.groups.length &&
    list.every((g, i) => g?.id === data.groups[i].id && Array.isArray(g.pairIds)) &&
    assigned.length === data.pairs.length &&
    new Set(assigned).size === assigned.length &&
    data.pairs.every((p) => assigned.includes(p.id));
  if (!valid) return fail('GROUPS_INVALID');

  const { structure } = data;
  if (structure.type === 'groups_knockout') {
    const issues = checkGroups(
      data.pairs.length,
      structure.groupCount,
      structure.advanceA,
      structure.advanceB,
      list.map((g) => (g.pairIds as string[]).length),
    );
    if (issues.length > 0) return { issues };
  }

  return restructure(data, {
    groups: data.groups.map((g, i) => ({
      ...g,
      pairIds: list[i].pairIds as string[],
      standings: [],
      complete: false,
    })),
  });
}

/** Random draw: shuffles pairs across groups keeping the group sizes, or the knockout seeding. */
export function draw(data: TournamentData, random: () => number = Math.random): EditResult {
  if (hasResults(data)) return fail('STRUCTURE_LOCKED');

  if (data.groups.length === 0) {
    return restructure(data, { seeding: shuffle(data.seeding, random) });
  }
  const shuffled = shuffle(
    data.groups.flatMap((g) => g.pairIds),
    random,
  );
  let next = 0;
  const groups = data.groups.map((g) => {
    const pairIds = shuffled.slice(next, next + g.pairIds.length);
    next += g.pairIds.length;
    return { ...g, pairIds, standings: [], complete: false };
  });
  return restructure(data, { groups });
}

export interface MatchChanges {
  scoreA?: unknown;
  scoreB?: unknown;
  courtId?: unknown;
  timeSlotId?: unknown;
}

const isScore = (value: unknown) =>
  value === null ||
  (Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_SCORE);

/**
 * Score, court and time of a match; only the fields present change. A knockout score can be
 * entered once both sides are known, and remembers who played it.
 */
export function updateMatch(data: TournamentData, matchId: string, changes: unknown): EditResult {
  const match = data.matches.find((m) => m.id === matchId);
  if (!match) return fail('NOT_FOUND');
  const body = (changes && typeof changes === 'object' ? changes : {}) as MatchChanges;
  const has = (key: keyof MatchChanges) => Object.hasOwn(body, key);

  const updated = { ...match };
  if (has('scoreA') || has('scoreB')) {
    const scoreA = has('scoreA') ? body.scoreA : match.scoreA;
    const scoreB = has('scoreB') ? body.scoreB : match.scoreB;
    if (!isScore(scoreA) || !isScore(scoreB)) return fail('SCORE_INVALID', { max: MAX_SCORE });
    if (match.state === 'bye') return fail('MATCH_BYE');
    const scored = scoreA !== null || scoreB !== null;
    if (match.phase === 'knockout' && scored && (!match.pairA || !match.pairB)) {
      return fail('MATCH_NOT_READY');
    }
    updated.scoreA = scoreA as number | null;
    updated.scoreB = scoreB as number | null;
    if (match.phase === 'knockout') {
      updated.scoredPairs = scored ? [match.pairA!, match.pairB!] : [];
    }
  }
  if (has('courtId')) {
    if (body.courtId !== null && !data.courts.some((c) => c.id === body.courtId)) {
      return fail('COURT_UNKNOWN');
    }
    updated.courtId = body.courtId as string | null;
  }
  if (has('timeSlotId')) {
    if (body.timeSlotId !== null && !data.timeSlots.some((s) => s.id === body.timeSlotId)) {
      return fail('SLOT_UNKNOWN');
    }
    updated.timeSlotId = body.timeSlotId as string | null;
  }

  const matches = data.matches.map((m) => (m.id === matchId ? updated : m));
  return { data: refreshTournament({ ...data, matches }) };
}
