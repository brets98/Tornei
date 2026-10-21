import { shuffle } from './groups.js';
import { checkSets, cleanSets } from './score.js';
import { checkGroups, LEVELS, LIMITS, normalizeTime, parseSetup, type Issue } from './setup.js';
import { buildMatches, drawByLevel, refreshTournament } from './tournament.js';
import type { SetScore, TournamentData } from './types.js';

/** The edited tournament, refreshed; or why the edit can't be done. `NOT_FOUND`: unknown pair/match. */
export type EditResult =
  { data: TournamentData; issues?: never } | { data?: never; issues: Issue[] };

const fail = (code: string, params?: Issue['params']): EditResult => ({
  issues: [params ? { code, params } : { code }],
});

/** Groups and draw can change only until any result is entered. */
export function hasResults(data: TournamentData) {
  return data.matches.some((m) => m.sets.length > 0);
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
  // The consolation draw is made from the names: they can change but not be removed
  if (data.structure.type === 'knockout_consolation' && names.some((n: string) => !n.trim())) {
    return fail('PLAYERS_REQUIRED');
  }

  const pairs = data.pairs.map((p) =>
    p.id === pairId ? { ...p, players: names.map((n: string) => n.trim()) } : p,
  );
  return { data: refreshTournament({ ...data, pairs }) };
}

/**
 * A pair's level in the consolation draw, until the first result. It counts from the next
 * draw: the current one stays as it is.
 */
export function setLevel(data: TournamentData, pairId: string, level: unknown): EditResult {
  const pair = data.pairs.find((p) => p.id === pairId);
  if (!pair || data.structure.type !== 'knockout_consolation') return fail('NOT_FOUND');
  if (hasResults(data)) return fail('STRUCTURE_LOCKED');
  if (!(Number.isInteger(level) && (level as number) >= 1 && (level as number) <= LEVELS)) {
    return fail('LEVELS_INVALID', { max: LEVELS });
  }

  const pairs = data.pairs.map((p) => (p.id === pairId ? { ...p, level: level as number } : p));
  return { data: refreshTournament({ ...data, pairs }) };
}

/** Changes a pair's players and/or level: only the fields sent (at least one). */
export function updatePair(
  data: TournamentData,
  pairId: string,
  changes: { players?: unknown; level?: unknown },
): EditResult {
  const { players, level } = changes;
  if (players === undefined && level === undefined) {
    return fail('PLAYERS_INVALID', { max: LIMITS.playerNameLength });
  }
  const result = players === undefined ? { data } : setPlayers(data, pairId, players);
  return level === undefined || !result.data ? result : setLevel(result.data, pairId, level);
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

/**
 * Random draw: shuffles pairs across groups keeping the group sizes, or the knockout seeding
 * (the consolation draw by level, at random among equal levels).
 */
export function draw(data: TournamentData, random: () => number = Math.random): EditResult {
  if (hasResults(data)) return fail('STRUCTURE_LOCKED');

  if (data.structure.type === 'knockout_consolation') {
    return restructure(data, { seeding: drawByLevel(data.pairs, random) });
  }
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

/** Clears every result, keeping setup, pairs, groups and schedule. */
export function resetResults(data: TournamentData): EditResult {
  const matches = data.matches.map((m) => ({
    ...m,
    sets: [],
    ...(m.phase === 'knockout' && { scoredPairs: [] }),
  }));
  return { data: refreshTournament({ ...data, matches }) };
}

/** The brackets cleared with `id`: itself, and the consolation when it is filled from A. */
export function bracketsCleared(data: TournamentData, id: string): string[] {
  if (!data.brackets.some((b) => b.id === id)) return [];
  return id === 'A' && data.brackets.some((b) => b.id === 'C') ? ['A', 'C'] : [id];
}

/** Clears every result of a bracket (and of those it fills), keeping pairs and schedule. */
export function resetBracket(data: TournamentData, id: string): EditResult {
  const cleared = bracketsCleared(data, id);
  if (cleared.length === 0) return fail('NOT_FOUND');
  const matches = data.matches.map((m) =>
    m.bracket && cleared.includes(m.bracket) ? { ...m, sets: [], scoredPairs: [] } : m,
  );
  return { data: refreshTournament({ ...data, matches }) };
}

/** Next free id like `c4`, after every id in use. */
function nextIds(prefix: string, used: string[]) {
  let n = Math.max(0, ...used.map((id) => Number(id.slice(prefix.length)) || 0));
  return () => `${prefix}${++n}`;
}

const list = (value: unknown) =>
  (Array.isArray(value) ? value : []).map((item) =>
    item && typeof item === 'object' ? (item as Record<string, unknown>) : {},
  );

/**
 * Name, subtitle, date, courts, time slots and match format; only the fields present change.
 * Courts and slots are lists of `{ id, name }` / `{ id, time }`: an existing id keeps its
 * matches, no id adds one, and a court or slot left out is removed from its matches. The
 * match format can change only while no result has been entered.
 */
export function updateSettings(data: TournamentData, changes: unknown): EditResult {
  const body = (changes && typeof changes === 'object' ? changes : {}) as Record<string, unknown>;
  const has = (key: string) => Object.hasOwn(body, key);
  const courtsIn = list(has('courts') ? body.courts : data.courts);
  const slotsIn = list(has('timeSlots') ? body.timeSlots : data.timeSlots);

  // The same checks as the wizard, on the tournament with the changes applied
  const { setup, issues } = parseSetup({
    ...data,
    name: has('name') ? body.name : data.name,
    subtitle: has('subtitle') ? body.subtitle : data.subtitle,
    date: has('date') ? body.date : data.date,
    pairCount: data.pairs.length,
    courts: courtsIn.map((c) => c.name),
    timeSlots: slotsIn.map((s) => s.time),
    matchFormat: has('matchFormat') ? body.matchFormat : data.matchFormat,
  });
  if (issues.length > 0) return { issues };

  const format = setup.matchFormat;
  const formatChanged =
    format.bestOf !== data.matchFormat.bestOf ||
    format.gamesPerSet !== data.matchFormat.gamesPerSet ||
    format.decider !== data.matchFormat.decider;
  if (formatChanged && hasResults(data)) return fail('MATCH_FORMAT_LOCKED');

  const known = (ids: string[], items: Record<string, unknown>[]) => {
    const given = items.map((item) => item.id).filter((id) => id !== undefined && id !== null);
    return given.every((id) => ids.includes(id as string)) && new Set(given).size === given.length;
  };
  if (
    !known(
      data.courts.map((c) => c.id),
      courtsIn,
    )
  )
    return fail('COURT_UNKNOWN');
  if (
    !known(
      data.timeSlots.map((s) => s.id),
      slotsIn,
    )
  )
    return fail('SLOT_UNKNOWN');

  const courtId = nextIds(
    'c',
    data.courts.map((c) => c.id),
  );
  const courts = courtsIn.map((c, i) => ({
    id: typeof c.id === 'string' ? c.id : courtId(),
    name: setup.courts[i],
  }));
  const slotId = nextIds(
    't',
    data.timeSlots.map((s) => s.id),
  );
  const timeSlots = slotsIn
    .map((s) => ({
      id: typeof s.id === 'string' ? s.id : slotId(),
      time: normalizeTime(String(s.time))!,
    }))
    .sort((a, b) => a.time.localeCompare(b.time));

  const courtIds = new Set(courts.map((c) => c.id));
  const slotIds = new Set(timeSlots.map((s) => s.id));
  const matches = data.matches.map((m) => ({
    ...m,
    courtId: m.courtId && courtIds.has(m.courtId) ? m.courtId : null,
    timeSlotId: m.timeSlotId && slotIds.has(m.timeSlotId) ? m.timeSlotId : null,
  }));

  return {
    data: refreshTournament({
      ...data,
      name: setup.name,
      subtitle: setup.subtitle,
      date: setup.date,
      courts,
      timeSlots,
      matchFormat: format,
      matches,
    }),
  };
}

export interface MatchChanges {
  sets?: unknown;
  courtId?: unknown;
  timeSlotId?: unknown;
}

/**
 * Result, court and time of a match; only the fields present change. The result must be
 * complete and valid for the tournament's match format (`[]` clears it). A knockout result
 * can be entered once both sides are known, and remembers who played it.
 */
export function updateMatch(data: TournamentData, matchId: string, changes: unknown): EditResult {
  const match = data.matches.find((m) => m.id === matchId);
  if (!match) return fail('NOT_FOUND');
  const body = (changes && typeof changes === 'object' ? changes : {}) as MatchChanges;
  const has = (key: keyof MatchChanges) => Object.hasOwn(body, key);

  const updated = { ...match };
  if (has('sets')) {
    const issue = checkSets(body.sets, data.matchFormat);
    if (issue) return { issues: [issue] };
    if (match.state === 'bye') return fail('MATCH_BYE');
    const sets = cleanSets(body.sets as SetScore[]);
    const scored = sets.length > 0;
    if (match.phase === 'knockout' && scored && (!match.pairA || !match.pairB)) {
      return fail('MATCH_NOT_READY');
    }
    updated.sets = sets;
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
