import { fill } from '../i18n/context';
import type { Messages } from '../i18n/en';
import { decidingSet, setsChoice, type MatchFormat, type SetScore } from './score';

/** Shapes returned by /api/tournaments (see server/src/domain/types.ts). */

export type Sport = 'padel' | 'tennis';
export type Format = 'singles' | 'doubles';
export type StructureType = 'groups_knockout' | 'knockout' | 'groups';
export type TournamentStatus = 'draft' | 'groups' | 'knockout' | 'finished';

export interface Summary {
  status: TournamentStatus;
  matchesDone: number;
  matchesTotal: number;
}

export interface TournamentListItem {
  id: string;
  name: string;
  subtitle: string;
  sport: Sport;
  format: Format;
  date: string;
  summary: Summary;
}

export interface Issue {
  code: string;
  params?: Record<string, string | number>;
}

export interface Preview {
  groupSizes: number[];
  brackets: { id: 'A' | 'B'; entrants: number; size: number; byes: number }[];
  matchesTotal: number;
}

export type MatchState = 'todo' | 'done' | 'invalid' | 'bye' | 'stale';

/** Where a knockout side comes from. */
export type Source =
  | { kind: 'group'; groupId: string; position: number }
  | { kind: 'seed'; index: number }
  | { kind: 'winner'; matchId: string }
  | { kind: 'bye' };

export interface Match {
  id: string;
  phase: 'group' | 'knockout';
  groupId?: string;
  bracket?: 'A' | 'B';
  round?: number;
  index?: number;
  sourceA?: Source;
  sourceB?: Source;
  pairA: string | null;
  pairB: string | null;
  /** The result set by set; empty until entered */
  sets: SetScore[];
  courtId: string | null;
  timeSlotId: string | null;
  state: MatchState;
  winner: string | null;
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
  id: string;
  pairIds: string[];
  standings: StandingRow[];
  complete: boolean;
}

export interface Tournament extends TournamentListItem {
  courts: { id: string; name: string }[];
  timeSlots: { id: string; time: string }[];
  structure: { type: StructureType; groupCount: number; advanceA: number; advanceB: number };
  matchFormat: MatchFormat;
  pairs: { id: string; players: string[] }[];
  groups: Group[];
  seeding: string[];
  matches: Match[];
  brackets: Bracket[];
}

export interface Bracket {
  id: 'A' | 'B';
  /** Slots of the first round: a power of 2 */
  size: number;
  champion: string | null;
}

/** Groups and draw can change until any result is entered (same rule as the server). */
export function isStructureLocked(tournament: Pick<Tournament, 'matches'>) {
  return tournament.matches.some((m) => m.sets.length > 0);
}

export function issueMessage(t: Messages, { code, params }: Issue): string {
  const template = t.issues[code];
  return template ? fill(template, params) : fill(t.issues.unknown, { code });
}

/** 'Coppie' / 'giocatori', etc., for the tournament's format. */
export function entriesLabel(t: Messages, format: Format) {
  return t.entries[format];
}

/** 'Al meglio dei 5 set, tie-break a 10 sul 6-6 nel quinto set' */
export function matchFormatName(t: Messages, format: MatchFormat): string {
  const sets = setsChoice(format);
  if (sets === 'oneSet' || sets === 'proSet') return t.matchFormats[sets];
  return fill(t.matchFormats.names[format.decider], {
    sets: t.matchFormats[sets],
    nth: t.matchFormats.nth[decidingSet(format)],
  });
}

/** Name of a knockout round from how many matches it has: 1 → 'Finale', 2 → 'Semifinali', … */
export function roundName(t: Messages, matches: number, round: number): string {
  return t.rounds[matches] ?? fill(t.rounds.other, { n: round + 1 });
}

/** A pair by its players' names, or by its code ('A1', or the seed number) while they're empty. */
export function pairLabel(
  tournament: Pick<Tournament, 'pairs' | 'groups' | 'seeding'>,
  pairId: string,
) {
  const names = tournament.pairs
    .find((p) => p.id === pairId)
    ?.players.map((p) => p.trim())
    .filter(Boolean);
  if (names?.length) return names.join(' / ');
  return pairCode(tournament, pairId);
}

export function pairCode(tournament: Pick<Tournament, 'groups' | 'seeding'>, pairId: string) {
  for (const group of tournament.groups) {
    const index = group.pairIds.indexOf(pairId);
    if (index !== -1) return `${group.id}${index + 1}`;
  }
  const seed = tournament.seeding.indexOf(pairId);
  return seed !== -1 ? String(seed + 1) : pairId;
}

/** Short name of a knockout match: 'QF 2', 'Quarto 2', or just 'Final' for the only one. */
export function knockoutMatchName(t: Messages, bracket: Bracket, match: Match) {
  const inRound = bracket.size / 2 ** (match.round! + 1);
  const round = t.roundsShort[inRound] ?? fill(t.roundsShort.other, { n: match.round! + 1 });
  return inRound === 1 ? round : fill(t.bracket.match, { round, n: match.index! + 1 });
}

/** '2026-10-20' → '20/10/2026', without timezone shifts. */
export function formatDate(date: string) {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}
