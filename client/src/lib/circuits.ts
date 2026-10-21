import type { Summary } from './tournaments';

/** Shapes returned by /api/players and /api/circuits (see server/src/domain/circuit.ts). */

export interface Player {
  id: string;
  name: string;
}

/** Results that award points, best first (`points.places[i]` is worth `PLACES[i]`). */
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

export interface Category {
  /** Missing on a category not saved yet */
  id?: string;
  name: string;
  points: { places: number[]; groups: number; participation: number };
}

export interface CircuitListItem {
  id: string;
  name: string;
  season: string;
  categories: Category[];
  stageCount: number;
}

export interface Stage {
  id: string;
  name: string;
  date: string;
  categoryId: string;
  summary: Summary;
}

export interface RankingRow {
  playerId: string;
  name: string;
  points: number;
  stages: number;
  wins: number;
  finals: number;
  /** Best place reached, as an index of PLACES (PLACES.length: out in the groups) */
  best: number;
  results: { stageId: string; place: Place; points: number }[];
}

export interface Circuit extends Omit<CircuitListItem, 'stageCount'> {
  updatedAt: string;
  stages: Stage[];
  ranking: RankingRow[];
  /** Names in finished stages not linked to a player: they get no points */
  unlinked: { stageId: string; count: number }[];
}

/** A tournament's link to a circuit: it is one of its stages, in one of its categories. */
export interface StageLink {
  circuitId: string;
  categoryId: string;
}

/** The place for an index of PLACES, or `groups` past the end. */
export const placeAt = (index: number): Place => PLACES[index] ?? 'groups';

/** Datalist id of the player registry, rendered once per page that suggests names. */
export const PLAYERS_LIST_ID = 'registry-players';
