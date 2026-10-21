/** Domain types of a tournament, shared by the pure functions and the Mongoose model. */

export const SPORTS = ['padel', 'tennis'] as const;
export type Sport = (typeof SPORTS)[number];

export const FORMATS = ['singles', 'doubles'] as const;
export type Format = (typeof FORMATS)[number];

/**
 * `knockout_consolation`: a knockout drawn at random, plus a consolation bracket (C) for
 * everyone who loses their first match.
 */
export const STRUCTURE_TYPES = [
  'groups_knockout',
  'knockout',
  'groups',
  'knockout_consolation',
] as const;
export type StructureType = (typeof STRUCTURE_TYPES)[number];

/** A and B: main brackets; C: the consolation bracket of `knockout_consolation`. */
export type BracketId = 'A' | 'B' | 'C';

/**
 * How a match is played: best of `bestOf` sets to `gamesPerSet` games. The deciding set (the
 * last possible one) is a normal set (`set`), a set whose tie-break at 6-6 is played to 10
 * (`tiebreak10`, as in Grand Slams), or a super tie-break to 10 instead of the set
 * (`superTiebreak`, common in padel).
 */
export interface MatchFormat {
  bestOf: number;
  gamesPerSet: number;
  decider: 'set' | 'tiebreak10' | 'superTiebreak';
}

/** One set from side A's point of view. A super tie-break stores its points as `a`/`b`. */
export interface SetScore {
  a: number;
  b: number;
  /** Points of the tie-break, for a set won 7-6 (or 5-4, 9-8) */
  tiebreak?: { a: number; b: number };
}

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
  /** Consolation draw: strength from 1 (best) to `LEVELS`; seeds the draw */
  level?: number;
}

export interface StandingRow {
  pairId: string;
  played: number;
  wins: number;
  losses: number;
  setsFor: number;
  setsAgainst: number;
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
  /**
   * Consolation: whoever loses their first match among those who started in this
   * first-round match: its loser, or, after a bye, the bye pair if it loses the next match
   * (if it wins, nobody comes from here and the other side gets a bye).
   */
  | { kind: 'firstLoser'; matchId: string }
  | { kind: 'bye' };

/**
 * - todo: not played yet; done: valid result; invalid: a result not valid for the match format
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
  /** The result, set by set; empty until entered */
  sets: SetScore[];
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

/**
 * A scheduling clash: two or more matches on the same court at the same time (`court`), or a
 * pair with two or more matches at the same time (`pair`).
 */
export interface Conflict {
  kind: 'court' | 'pair';
  timeSlotId: string;
  /** `court` only */
  courtId?: string;
  /** `pair` only */
  pairId?: string;
  matchIds: string[];
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
  matchFormat: MatchFormat;
  /** Players of each pair, in entry order; required for `knockout_consolation` only */
  players?: string[][];
  /** `knockout_consolation`: each pair's level, 1 (best) to `LEVELS` */
  levels?: number[];
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
  matchFormat: MatchFormat;
  pairs: Pair[];
  groups: Group[];
  /** Knockout only: pair ids in seed order */
  seeding: string[];
  matches: Match[];
  brackets: Bracket[];
  summary: Summary;
  conflicts: Conflict[];
}
