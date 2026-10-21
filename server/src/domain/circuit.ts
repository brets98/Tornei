import type { Issue } from './setup.js';
import type { TournamentData } from './types.js';

/**
 * Circuits: series of tournaments (stages) whose results award points to each player, added
 * up in a ranking. See CLAUDE.md, "Circuits".
 */

/** Results that award points, best first: `points.places[i]` is worth `PLACES[i]`. */
export const PLACES = [
  'winner',
  'runnerUp',
  'semifinal',
  'quarterfinal',
  'round16',
  'round32',
  'round64',
] as const;
export type Place = (typeof PLACES)[number] | 'groups';

export interface CategoryPoints {
  /** One value per `PLACES` entry */
  places: number[];
  /** Out in the group phase (also those who go on to bracket B) */
  groups: number;
  /** Added for every player of every stage */
  participation: number;
}

export interface Category {
  /** 'k1', 'k2', …: never reused */
  id: string;
  name: string;
  points: CategoryPoints;
}

export interface CircuitData {
  name: string;
  season: string;
  categories: Category[];
}

export const CIRCUIT_LIMITS = {
  nameLength: 100,
  seasonLength: 40,
  categoryNameLength: 40,
  maxCategories: 10,
  maxPoints: 100000,
} as const;

/** What a new circuit starts with, in the proportions of Premier Padel. */
export const DEFAULT_CATEGORIES: Omit<Category, 'id'>[] = [
  {
    name: 'Major',
    points: { places: [2000, 1200, 720, 360, 180, 90, 45], groups: 45, participation: 10 },
  },
  {
    name: 'P1',
    points: { places: [1000, 600, 360, 180, 90, 45, 25], groups: 25, participation: 10 },
  },
  {
    name: 'P2',
    points: { places: [500, 300, 180, 90, 45, 25, 10], groups: 10, participation: 10 },
  },
];

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const isPoints = (value: unknown) =>
  Number.isInteger(value) &&
  (value as number) >= 0 &&
  (value as number) <= CIRCUIT_LIMITS.maxPoints;

/**
 * Reads and validates a circuit (name, season, categories with their points). Categories
 * with a known `id` keep it, new ones get the next free id; `usedCategoryIds` (those of its
 * stages) can't be removed.
 */
export function parseCircuit(
  input: unknown,
  previous: Category[] = [],
  usedCategoryIds: string[] = [],
): { circuit: CircuitData; issues: Issue[] } {
  const body = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const issues: Issue[] = [];

  const name = text(body.name);
  if (!name) issues.push({ code: 'CIRCUIT_NAME_REQUIRED' });
  if (name.length > CIRCUIT_LIMITS.nameLength) {
    issues.push({ code: 'CIRCUIT_NAME_TOO_LONG', params: { max: CIRCUIT_LIMITS.nameLength } });
  }
  const season = text(body.season);
  if (season.length > CIRCUIT_LIMITS.seasonLength) {
    issues.push({ code: 'SEASON_TOO_LONG', params: { max: CIRCUIT_LIMITS.seasonLength } });
  }

  const raw = (Array.isArray(body.categories) ? body.categories : []).map((c) =>
    c && typeof c === 'object' ? (c as Record<string, unknown>) : {},
  );
  if (raw.length === 0) issues.push({ code: 'CATEGORIES_REQUIRED' });
  if (raw.length > CIRCUIT_LIMITS.maxCategories) {
    issues.push({ code: 'CATEGORIES_TOO_MANY', params: { max: CIRCUIT_LIMITS.maxCategories } });
  }

  const known = previous.map((c) => c.id);
  let next = Math.max(0, ...known.map((id) => Number(id.slice(1)) || 0));
  const categories: Category[] = raw.map((c) => {
    const points = (c.points && typeof c.points === 'object' ? c.points : {}) as Record<
      string,
      unknown
    >;
    return {
      id: typeof c.id === 'string' && known.includes(c.id) ? c.id : `k${++next}`,
      name: text(c.name),
      points: {
        places: Array.isArray(points.places) ? (points.places as number[]) : [],
        groups: points.groups as number,
        participation: points.participation as number,
      },
    };
  });

  if (categories.some((c) => !c.name)) issues.push({ code: 'CATEGORY_NAME_REQUIRED' });
  if (categories.some((c) => c.name.length > CIRCUIT_LIMITS.categoryNameLength)) {
    issues.push({
      code: 'CATEGORY_NAME_TOO_LONG',
      params: { max: CIRCUIT_LIMITS.categoryNameLength },
    });
  }
  const duplicate = categories.find(
    (c, i) =>
      c.name && categories.findIndex((o) => o.name.toLowerCase() === c.name.toLowerCase()) !== i,
  );
  if (duplicate) issues.push({ code: 'CATEGORY_DUPLICATE', params: { name: duplicate.name } });
  const ids = raw.map((c) => c.id).filter((id) => id !== undefined && id !== null);
  if (new Set(ids).size !== ids.length) issues.push({ code: 'CATEGORY_UNKNOWN' });
  if (
    categories.some(
      ({ points: p }) =>
        p.places.length !== PLACES.length ||
        ![...p.places, p.groups, p.participation].every(isPoints),
    )
  ) {
    issues.push({ code: 'POINTS_INVALID', params: { max: CIRCUIT_LIMITS.maxPoints } });
  }
  const removed = usedCategoryIds.find((id) => !categories.some((c) => c.id === id));
  if (removed) {
    const category = previous.find((c) => c.id === removed);
    issues.push({ code: 'CATEGORY_IN_USE', params: { name: category?.name ?? removed } });
  }

  return {
    circuit: {
      name,
      season,
      categories: categories.map((c) => ({
        ...c,
        points: {
          places: c.points.places.slice(0, PLACES.length),
          groups: c.points.groups,
          participation: c.points.participation,
        },
      })),
    },
    issues,
  };
}

/**
 * How far each pair got in a finished tournament (null while it isn't finished): its round
 * in bracket A (the champion is `winner`; a pair that lost in the semifinals `semifinal`,
 * also after a bye), `groups` for those who didn't reach it. With a single group, the final
 * position counts like a bracket: 1st winner, 2nd runner-up, 3rd–4th semifinal, …
 */
export function placements(data: TournamentData): Map<string, Place> | null {
  if (data.summary.status !== 'finished') return null;
  const result = new Map<string, Place>();
  const place = (fromLast: number) => PLACES[Math.min(fromLast, PLACES.length - 1)];

  if (data.structure.type === 'groups') {
    data.groups[0]?.standings.forEach((row, i) =>
      result.set(row.pairId, place(Math.ceil(Math.log2(i + 1)))),
    );
    return result;
  }

  const bracket = data.brackets.find((b) => b.id === 'A');
  if (!bracket) return result;
  const rounds = Math.log2(bracket.size);
  for (const m of data.matches) {
    if (m.bracket !== 'A' || m.state !== 'done' || !m.winner) continue;
    const loser = m.winner === m.pairA ? m.pairB : m.pairA;
    if (loser) result.set(loser, place(rounds - m.round!));
  }
  if (bracket.champion) result.set(bracket.champion, 'winner');
  for (const pair of data.pairs) {
    if (!result.has(pair.id)) result.set(pair.id, 'groups');
  }
  return result;
}

export function pointsFor(place: Place, points: CategoryPoints) {
  const base = place === 'groups' ? points.groups : points.places[PLACES.indexOf(place)];
  return (base ?? 0) + points.participation;
}

/** An entry of a finished stage: its players (linked to the registry or not) and its result. */
export interface StageEntry {
  players: string[];
  playerIds?: (string | null)[];
  place: Place;
}

/** A stage as the ranking needs it: `entries` is null while it isn't finished. */
export interface Stage {
  id: string;
  date: string;
  categoryId: string;
  entries: StageEntry[] | null;
}

/** The entries of a tournament with their result (see `placements`); null until finished. */
export function tournamentEntries(data: TournamentData): StageEntry[] | null {
  const places = placements(data);
  return places && data.pairs.map((pair) => ({ ...pair, place: places.get(pair.id)! }));
}

export interface StageResult {
  stageId: string;
  place: Place;
  points: number;
}

export interface RankingRow {
  playerId: string;
  points: number;
  stages: number;
  wins: number;
  finals: number;
  /** Best place reached, as an index of `PLACES` (PLACES.length = only groups) */
  best: number;
  results: StageResult[];
}

const placeIndex = (place: Place) => (place === 'groups' ? PLACES.length : PLACES.indexOf(place));

/**
 * The circuit ranking: every player of the finished stages with the sum of their points.
 * Ties: more stages won, more finals, then `names` alphabetically. Players with no registry
 * link get no points: `unlinked` counts them per stage.
 */
export function ranking(
  stages: Stage[],
  categories: Category[],
  names: Map<string, string>,
): { rows: RankingRow[]; unlinked: { stageId: string; count: number }[] } {
  const rows = new Map<string, RankingRow>();
  const unlinked: { stageId: string; count: number }[] = [];

  for (const stage of [...stages].sort((a, b) => a.date.localeCompare(b.date))) {
    const category = categories.find((c) => c.id === stage.categoryId);
    if (!category || !stage.entries) continue;
    let missing = 0;
    for (const pair of stage.entries) {
      const { place } = pair;
      const points = pointsFor(place, category.points);
      pair.players.forEach((name, i) => {
        const playerId = pair.playerIds?.[i];
        if (!playerId) {
          if (name) missing++;
          return;
        }
        const row = rows.get(playerId) ?? {
          playerId,
          points: 0,
          stages: 0,
          wins: 0,
          finals: 0,
          best: PLACES.length,
          results: [],
        };
        row.points += points;
        row.stages++;
        if (place === 'winner') row.wins++;
        if (place === 'winner' || place === 'runnerUp') row.finals++;
        row.best = Math.min(row.best, placeIndex(place));
        row.results.push({ stageId: stage.id, place, points });
        rows.set(playerId, row);
      });
    }
    if (missing > 0) unlinked.push({ stageId: stage.id, count: missing });
  }

  const name = (id: string) => names.get(id) ?? '';
  return {
    rows: [...rows.values()].sort(
      (a, b) =>
        b.points - a.points ||
        b.wins - a.wins ||
        b.finals - a.finals ||
        name(a.playerId).localeCompare(name(b.playerId)),
    ),
    unlinked,
  };
}

/**
 * A stage played before it was in the app: only each entry's players and final result, no
 * matches. Kept in its circuit (`pastStages`); ids `m1…`.
 */
export interface PastStage {
  id: string;
  name: string;
  /** 'YYYY-MM-DD' */
  date: string;
  categoryId: string;
  entries: StageEntry[];
}

export const PAST_STAGE_LIMITS = { maxEntries: 128, playerNameLength: 60 } as const;

const PAST_PLACES: readonly Place[] = [...PLACES, 'groups'];

/**
 * Reads and validates a past stage against its circuit's categories. Entries have 1 or 2
 * names each, all filled in, every player at most once.
 */
export function parsePastStage(
  input: unknown,
  categories: Category[],
): { stage: Omit<PastStage, 'id'>; issues: Issue[] } {
  const body = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const issues: Issue[] = [];

  const name = text(body.name);
  if (!name) issues.push({ code: 'STAGE_NAME_REQUIRED' });
  if (name.length > CIRCUIT_LIMITS.nameLength) {
    issues.push({ code: 'STAGE_NAME_TOO_LONG', params: { max: CIRCUIT_LIMITS.nameLength } });
  }
  const date = text(body.date);
  const parsed = new Date(`${date}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(parsed.getTime()) ||
    !parsed.toISOString().startsWith(date)
  ) {
    issues.push({ code: 'DATE_INVALID' });
  }
  const categoryId = text(body.categoryId);
  if (!categories.some((c) => c.id === categoryId)) issues.push({ code: 'CATEGORY_UNKNOWN' });

  const raw = (Array.isArray(body.entries) ? body.entries : []).map((e) =>
    e && typeof e === 'object' ? (e as Record<string, unknown>) : {},
  );
  const entries: StageEntry[] = raw.map((e) => ({
    players: (Array.isArray(e.players) ? e.players : []).map(text),
    place: PAST_PLACES.find((p) => p === e.place) ?? ('' as Place),
  }));
  if (entries.length < 2) issues.push({ code: 'STAGE_ENTRIES_REQUIRED' });
  if (entries.length > PAST_STAGE_LIMITS.maxEntries) {
    issues.push({ code: 'STAGE_ENTRIES_TOO_MANY', params: { max: PAST_STAGE_LIMITS.maxEntries } });
  }
  const incomplete = entries.findIndex(
    (e) => e.players.length < 1 || e.players.length > 2 || e.players.some((p) => !p),
  );
  if (incomplete !== -1) {
    issues.push({ code: 'PLAYERS_INCOMPLETE', params: { n: incomplete + 1 } });
  }
  if (entries.some((e) => e.players.some((p) => p.length > PAST_STAGE_LIMITS.playerNameLength))) {
    issues.push({
      code: 'PLAYER_NAME_TOO_LONG',
      params: { max: PAST_STAGE_LIMITS.playerNameLength },
    });
  }
  const noPlace = entries.findIndex((e) => !e.place);
  if (noPlace !== -1) issues.push({ code: 'STAGE_PLACE_REQUIRED', params: { n: noPlace + 1 } });
  const names = entries.flatMap((e) => e.players).filter(Boolean);
  const twice = names.find(
    (n, i) => names.findIndex((o) => o.toLowerCase() === n.toLowerCase()) !== i,
  );
  if (twice) issues.push({ code: 'STAGE_PLAYER_TWICE', params: { name: twice } });

  return { stage: { name, date, categoryId, entries }, issues };
}
