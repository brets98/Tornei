/** Domain types of a tournament, shared by the pure functions and the Mongoose model. */

export const SPORTS = ['padel', 'tennis'] as const;
export type Sport = (typeof SPORTS)[number];

export const FORMATS = ['singles', 'doubles'] as const;
export type Format = (typeof FORMATS)[number];

export const STRUCTURE_TYPES = ['groups_knockout', 'knockout', 'groups'] as const;
export type StructureType = (typeof STRUCTURE_TYPES)[number];

export type BracketId = 'A' | 'B';

export type TournamentStatus = 'draft' | 'groups' | 'knockout' | 'finished';

export interface Structure {
  type: StructureType;
  /** 0 for `knockout`, 1 for `groups` */
  groupCount: number;
  /** Top positions of each group that go to bracket A (0 without groups + knockout) */
  advanceA: number;
  /** Following positions of each group that go to bracket B (0 = no bracket B) */
  advanceB: number;
}

export interface Court {
  id: string;
  name: string;
}

export interface TimeSlot {
  id: string;
  /** 'HH:MM' */
  time: string;
}

export interface Pair {
  id: string;
  /** 1 (singles) or 2 (doubles) names; empty strings until entered */
  players: string[];
}

export interface StandingRow {
  pairId: string;
  played: number;
  wins: number;
  losses: number;
  gamesFor: number;
  gamesAgainst: number;
}

export interface Group {
  /** Also its name: 'A', 'B', … */
  id: string;
  /** Initial order: the last tie-break */
  pairIds: string[];
  /** Ranked; persisted after every change */
  standings: StandingRow[];
  /** All matches done: positions are final and feed the brackets */
  complete: boolean;
}

/** Where a knockout side comes from. */
export type Source =
  | { kind: 'group'; groupId: string; position: number }
  | { kind: 'seed'; index: number }
  | { kind: 'winner'; matchId: string }
  | { kind: 'bye' };

/**
 * - todo: not played yet; done: valid result; invalid: equal scores
 * - bye: one side is a bye, the other advances without playing
 * - stale: knockout result entered for pairs that no longer play this match
 */
export type MatchState = 'todo' | 'done' | 'invalid' | 'bye' | 'stale';

export interface Match {
  id: string;
  phase: 'group' | 'knockout';
  groupId?: string;
  bracket?: BracketId;
  /** Knockout: 0 = first round */
  round?: number;
  /** Knockout: position within the round, top to bottom */
  index?: number;
  sourceA?: Source;
  sourceB?: Source;
  /** Who plays: always set in groups; resolved from the sources in knockout (null = not known yet) */
  pairA: string | null;
  pairB: string | null;
  scoreA: number | null;
  scoreB: number | null;
  /** Knockout: who played when the score was entered */
  scoredPairs?: string[];
  courtId: string | null;
  timeSlotId: string | null;
  state: MatchState;
  winner: string | null;
}

export interface Bracket {
  id: BracketId;
  /** Next power of 2 of the entrants */
  size: number;
  champion: string | null;
}

export interface Summary {
  status: TournamentStatus;
  matchesDone: number;
  matchesTotal: number;
}

/** What the wizard asks for. */
export interface Setup {
  name: string;
  subtitle: string;
  sport: Sport;
  format: Format;
  /** 'YYYY-MM-DD' */
  date: string;
  pairCount: number;
  courts: string[];
  timeSlots: string[];
  structure: Structure;
}

/** A tournament without the persistence fields (id, owner, timestamps). */
export interface TournamentData {
  name: string;
  subtitle: string;
  sport: Sport;
  format: Format;
  date: string;
  courts: Court[];
  timeSlots: TimeSlot[];
  structure: Structure;
  pairs: Pair[];
  groups: Group[];
  /** Knockout only: pair ids in seed order */
  seeding: string[];
  matches: Match[];
  brackets: Bracket[];
  summary: Summary;
}
