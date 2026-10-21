import { fill } from '../i18n/context';
import type { Messages } from '../i18n/en';
import { decidingSet, setsChoice, type MatchFormat, type SetScore } from './score';

/** Shapes returned by /api/tournaments (see server/src/domain/types.ts). */

export type Sport = 'padel' | 'tennis';
export type Format = 'singles' | 'doubles';
export type StructureType = 'groups_knockout' | 'knockout' | 'groups' | 'knockout_consolation';
/** A and B: main brackets; C: the consolation bracket. */
export type BracketId = 'A' | 'B' | 'C';
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
  brackets: { id: BracketId; entrants: number; size: number; byes: number }[];
  matchesTotal: number;
}

export type MatchState = 'todo' | 'done' | 'invalid' | 'bye' | 'stale';

/** Where a knockout side comes from. */
export type Source =
  | { kind: 'group'; groupId: string; position: number }
  | { kind: 'seed'; index: number }
  | { kind: 'winner'; matchId: string }
  /** Consolation: whoever loses their first match among those who started in this match */
  | { kind: 'firstLoser'; matchId: string }
  | { kind: 'bye' };

export interface Match {
  id: string;
  phase: 'group' | 'knockout';
  groupId?: string;
  bracket?: BracketId;
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

/** Two matches on the same court and slot (`court`), or a pair twice in a slot (`pair`). */
export interface Conflict {
  kind: 'court' | 'pair';
  timeSlotId: string;
  courtId?: string;
  pairId?: string;
  matchIds: string[];
}

export interface Tournament extends TournamentListItem {
  updatedAt: string;
  courts: { id: string; name: string }[];
  timeSlots: { id: string; time: string }[];
  structure: { type: StructureType; groupCount: number; advanceA: number; advanceB: number };
  matchFormat: MatchFormat;
  /** `level`: consolation draw only, 1 (strongest) to 4 */
  pairs: { id: string; players: string[]; level?: number }[];
  groups: Group[];
  seeding: string[];
  matches: Match[];
  brackets: Bracket[];
  conflicts: Conflict[];
}

export interface Bracket {
  id: BracketId;
  /** Slots of the first round: a power of 2 */
  size: number;
  champion: string | null;
}

/** Levels of the consolation draw (see LEVELS on the server): 1 is the strongest. */
export const LEVELS = [1, 2, 3, 4];

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

/** The brackets emptied with `id` (same rule as the server): bracket A also empties the consolation. */
export function bracketsCleared(tournament: Pick<Tournament, 'brackets'>, id: BracketId) {
  return id === 'A' && tournament.brackets.some((b) => b.id === 'C') ? ['A', 'C'] : [id];
}

/** 'Tabellone A', or 'Consolazione' for bracket C. */
export function bracketName(t: Messages, id: BracketId) {
  return id === 'C' ? t.bracket.consolation : fill(t.bracket.title, { id });
}

/** Short name of a knockout match: 'QF 2', 'Quarto 2', or just 'Final' for the only one. */
export function knockoutMatchName(t: Messages, bracket: Bracket, match: Match) {
  const inRound = bracket.size / 2 ** (match.round! + 1);
  const round = t.roundsShort[inRound] ?? fill(t.roundsShort.other, { n: match.round! + 1 });
  return inRound === 1 ? round : fill(t.bracket.match, { round, n: match.index! + 1 });
}

/**
 * Who plays one side of a match: the pair once known, otherwise where it will come from
 * ('1° Girone A', 'Vincitore Quarto 2', 'Testa di serie 3').
 */
export function sideLabel(
  t: Messages,
  tournament: Pick<Tournament, 'pairs' | 'groups' | 'seeding' | 'matches' | 'brackets'>,
  match: Match,
  side: 'A' | 'B',
) {
  const pairId = side === 'A' ? match.pairA : match.pairB;
  const source = side === 'A' ? match.sourceA : match.sourceB;
  if (pairId) return pairLabel(tournament, pairId);
  switch (source?.kind) {
    case 'group':
      return fill(t.bracket.groupPosition, { group: source.groupId, position: source.position });
    case 'seed':
      return fill(t.bracket.seed, { n: source.index + 1 });
    case 'winner': {
      const from = findKnockoutMatch(tournament, source.matchId);
      return from ? fill(t.bracket.winnerOf, { match: knockoutMatchName(t, ...from) }) : '—';
    }
    case 'firstLoser': {
      if (match.state === 'bye') return t.bracket.bye;
      const first = findKnockoutMatch(tournament, source.matchId);
      if (!first) return '—';
      if (first[1].state !== 'bye') {
        return fill(t.bracket.loserOf, { match: knockoutMatchName(t, ...first) });
      }
      // After a bye, the pair's first match is the next round's
      const next = tournament.matches.find(
        (m) =>
          m.bracket === first[1].bracket &&
          m.round === 1 &&
          m.index === Math.floor(first[1].index! / 2),
      );
      return first[1].winner && next
        ? fill(t.bracket.loserAfterBye, {
            pair: pairLabel(tournament, first[1].winner),
            match: knockoutMatchName(t, first[0], next),
          })
        : '—';
    }
    case 'bye':
      return t.bracket.bye;
    default:
      return '—';
  }
}

/** A knockout match by id, with its bracket. */
function findKnockoutMatch(
  tournament: Pick<Tournament, 'matches' | 'brackets'>,
  matchId: string,
): [Bracket, Match] | undefined {
  const match = tournament.matches.find((m) => m.id === matchId);
  const bracket = tournament.brackets.find((b) => b.id === match?.bracket);
  return match && bracket ? [bracket, match] : undefined;
}

/** Where a match belongs: 'Girone A', 'Tabellone A · Quarto 2' or 'Consolazione · Finale'. */
export function matchPhase(t: Messages, tournament: Pick<Tournament, 'brackets'>, match: Match) {
  if (match.phase === 'group') return fill(t.tournament.group, { group: match.groupId! });
  const bracket = tournament.brackets.find((b) => b.id === match.bracket)!;
  return fill(t.overview.knockoutMatch, {
    bracket: bracketName(t, bracket.id),
    match: knockoutMatchName(t, bracket, match),
  });
}

/** Where and when a match is played: 'Bigi · 19:00', 'Bigi', '19:00', or '' if not scheduled. */
export function scheduleLabel(
  tournament: Pick<Tournament, 'courts' | 'timeSlots'>,
  match: Pick<Match, 'courtId' | 'timeSlotId'>,
) {
  return [
    tournament.courts.find((c) => c.id === match.courtId)?.name,
    tournament.timeSlots.find((s) => s.id === match.timeSlotId)?.time,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** '2026-10-20' → '20/10/2026', without timezone shifts. */
export function formatDate(date: string) {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}
