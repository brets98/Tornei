import { fill, it } from '../i18n/it';

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

export interface Tournament extends TournamentListItem {
  courts: { id: string; name: string }[];
  timeSlots: { id: string; time: string }[];
  structure: { type: StructureType; groupCount: number; advanceA: number; advanceB: number };
  pairs: { id: string; players: string[] }[];
  groups: { id: string; pairIds: string[] }[];
  seeding: string[];
}

export function issueMessage({ code, params }: Issue): string {
  const template = it.issues[code];
  return template ? fill(template, params) : fill(it.issues.unknown, { code });
}

/** 'Coppie' / 'giocatori', etc., for the tournament's format. */
export function entriesLabel(format: Format) {
  return it.entries[format];
}

/** Name of a knockout round from how many matches it has: 1 → 'Finale', 2 → 'Semifinali', … */
export function roundName(matches: number, round: number): string {
  const names: Record<number, string> = it.rounds;
  return names[matches] ?? fill(it.rounds.other, { n: round + 1 });
}

/** A pair by its players' names, or by its code ('A1', or the seed number) while they're empty. */
export function pairLabel(t: Pick<Tournament, 'pairs' | 'groups' | 'seeding'>, pairId: string) {
  const names = t.pairs
    .find((p) => p.id === pairId)
    ?.players.map((p) => p.trim())
    .filter(Boolean);
  if (names?.length) return names.join(' / ');
  return pairCode(t, pairId);
}

export function pairCode(t: Pick<Tournament, 'groups' | 'seeding'>, pairId: string) {
  for (const group of t.groups) {
    const index = group.pairIds.indexOf(pairId);
    if (index !== -1) return `${group.id}${index + 1}`;
  }
  const seed = t.seeding.indexOf(pairId);
  return seed !== -1 ? String(seed + 1) : pairId;
}

/** '2026-10-20' → '20/10/2026', without timezone shifts. */
export function formatDate(date: string) {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}
