import { DEFAULT_MATCH_FORMAT, isValidMatchFormat } from './score.js';
import {
  FORMATS,
  SPORTS,
  STRUCTURE_TYPES,
  type Format,
  type Setup,
  type StructureType,
} from './types.js';

export const LIMITS = {
  nameLength: 100,
  playerNameLength: 60,
  minPairs: 2,
  maxPairs: 64,
  maxGroups: 16,
  maxCourts: 20,
  courtNameLength: 40,
  maxTimeSlots: 48,
} as const;

/** Smallest group allowed: a round robin needs someone to play against. */
export const MIN_GROUP_SIZE = 2;

/** Fewer entries would leave the consolation bracket with at most one first-match loser. */
export const MIN_CONSOLATION_PAIRS = 4;

/** Levels of the consolation draw: 1 is the strongest, LEVELS the weakest (and the default). */
export const LEVELS = 4;

/** A reason why a setup can't work. The client turns `code` + `params` into a message. */
export interface Issue {
  code: string;
  params?: Record<string, string | number>;
}

/** Sizes of `groupCount` groups as even as possible, larger ones first: 10 in 3 → [4, 3, 3]. */
export function groupSizes(pairCount: number, groupCount: number): number[] {
  const base = Math.floor(pairCount / groupCount);
  const extra = pairCount % groupCount;
  return Array.from({ length: groupCount }, (_, i) => base + (i < extra ? 1 : 0));
}

/** '9:00' → '09:00'; null when not a valid time of day. */
export function normalizeTime(value: string): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [hours, minutes] = [Number(match[1]), Number(match[2])];
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${match[2]}`;
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const integer = (value: unknown) => (Number.isInteger(value) ? (value as number) : NaN);
const strings = (value: unknown) => (Array.isArray(value) ? value.map(text) : []);

function oneOf<T extends string>(values: readonly T[], value: unknown): T | undefined {
  return values.find((v) => v === value);
}

/**
 * Reads and validates what the wizard sends. Normalizes it (trimmed text, sorted 'HH:MM'
 * slots, structure fields that don't apply set to 0) and lists every problem found.
 */
export function parseSetup(input: unknown): { setup: Setup; issues: Issue[] } {
  const body = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const rawStructure = (
    body.structure && typeof body.structure === 'object' ? body.structure : {}
  ) as Record<string, unknown>;
  const issues: Issue[] = [];

  const name = text(body.name);
  if (!name) issues.push({ code: 'NAME_REQUIRED' });
  if (name.length > LIMITS.nameLength || text(body.subtitle).length > LIMITS.nameLength) {
    issues.push({ code: 'NAME_TOO_LONG', params: { max: LIMITS.nameLength } });
  }

  const sport = oneOf(SPORTS, body.sport);
  if (!sport) issues.push({ code: 'SPORT_INVALID' });
  const format = oneOf(FORMATS, body.format);
  if (!format) issues.push({ code: 'FORMAT_INVALID' });
  if (sport === 'padel' && format === 'singles') issues.push({ code: 'PADEL_SINGLES' });

  const date = text(body.date);
  if (!isValidDate(date)) issues.push({ code: 'DATE_INVALID' });

  const type = oneOf(STRUCTURE_TYPES, rawStructure.type);
  if (!type) issues.push({ code: 'STRUCTURE_INVALID' });
  const structure = normalizeStructure(type ?? 'knockout', rawStructure);

  // With the consolation draw the pairs are entered in the wizard: their list is the count
  const consolation = type === 'knockout_consolation';
  const entryFormat = sport === 'padel' ? 'doubles' : (format ?? 'doubles');
  const players = consolation ? parsePlayers(body.players, entryFormat, issues) : [];
  // Not sent: everyone at the same level, a fully random draw
  const levels = consolation
    ? Array.isArray(body.levels)
      ? body.levels.map(integer)
      : players.map(() => LEVELS)
    : [];
  if (levels.length !== players.length || !levels.every((l) => l >= 1 && l <= LEVELS)) {
    issues.push({ code: 'LEVELS_INVALID', params: { max: LEVELS } });
  }
  const pairCount = consolation ? players.length : integer(body.pairCount);
  const minPairs = consolation ? MIN_CONSOLATION_PAIRS : LIMITS.minPairs;
  if (!(pairCount >= minPairs && pairCount <= LIMITS.maxPairs)) {
    issues.push({ code: 'PAIR_COUNT_RANGE', params: { min: minPairs, max: LIMITS.maxPairs } });
  }

  const courts = strings(body.courts);
  if (courts.length === 0) issues.push({ code: 'COURTS_REQUIRED' });
  if (courts.length > LIMITS.maxCourts) {
    issues.push({ code: 'COURTS_TOO_MANY', params: { max: LIMITS.maxCourts } });
  }
  if (courts.some((c) => !c)) issues.push({ code: 'COURT_NAME_REQUIRED' });
  if (courts.some((c) => c.length > LIMITS.courtNameLength)) {
    issues.push({ code: 'COURT_NAME_TOO_LONG', params: { max: LIMITS.courtNameLength } });
  }
  const duplicateCourt = courts.find(
    (c, i) => c && courts.findIndex((o) => o.toLowerCase() === c.toLowerCase()) !== i,
  );
  if (duplicateCourt) issues.push({ code: 'COURT_DUPLICATE', params: { name: duplicateCourt } });

  const rawSlots = strings(body.timeSlots);
  const timeSlots = rawSlots.map(normalizeTime);
  if (rawSlots.length === 0) issues.push({ code: 'SLOTS_REQUIRED' });
  if (rawSlots.length > LIMITS.maxTimeSlots) {
    issues.push({ code: 'SLOTS_TOO_MANY', params: { max: LIMITS.maxTimeSlots } });
  }
  const badSlot = rawSlots.find((_, i) => !timeSlots[i]);
  if (badSlot !== undefined) issues.push({ code: 'SLOT_INVALID', params: { time: badSlot } });
  const duplicateSlot = timeSlots.find((t, i) => t && timeSlots.indexOf(t) !== i);
  if (duplicateSlot) issues.push({ code: 'SLOT_DUPLICATE', params: { time: duplicateSlot } });

  if (type === 'groups_knockout' && pairCount >= LIMITS.minPairs) {
    issues.push(
      ...checkGroups(pairCount, structure.groupCount, structure.advanceA, structure.advanceB),
    );
  }

  // Not sent: the usual best of 3 sets
  const matchFormat = body.matchFormat ?? DEFAULT_MATCH_FORMAT;
  const validFormat = isValidMatchFormat(matchFormat);
  if (!validFormat) issues.push({ code: 'MATCH_FORMAT_INVALID' });
  if (validFormat && sport === 'padel' && matchFormat.bestOf > 3) {
    issues.push({ code: 'MATCH_FORMAT_PADEL_FIVE_SETS' });
  }

  return {
    setup: {
      name,
      subtitle: text(body.subtitle),
      sport: sport ?? 'padel',
      format: entryFormat,
      date,
      pairCount,
      courts,
      timeSlots: timeSlots.filter((t): t is string => t !== null).sort(),
      structure,
      ...(consolation && { players, levels }),
      matchFormat: validFormat
        ? {
            bestOf: matchFormat.bestOf,
            gamesPerSet: matchFormat.gamesPerSet,
            decider: matchFormat.decider,
          }
        : DEFAULT_MATCH_FORMAT,
    },
    issues,
  };
}

/**
 * The players of each pair, trimmed: 1 name each for singles, 2 for doubles, none empty or
 * too long. Problems are added to `issues`, with the 1-based number of the first wrong entry.
 */
function parsePlayers(value: unknown, format: Format, issues: Issue[]): string[][] {
  const list = Array.isArray(value) ? value : [];
  const count = format === 'singles' ? 1 : 2;
  const players = list.map((names) => strings(names));
  const incomplete = players.findIndex((names) => names.length !== count || names.some((n) => !n));
  if (incomplete !== -1) issues.push({ code: 'PLAYERS_INCOMPLETE', params: { n: incomplete + 1 } });
  if (players.some((names) => names.some((n) => n.length > LIMITS.playerNameLength))) {
    issues.push({ code: 'PLAYER_NAME_TOO_LONG', params: { max: LIMITS.playerNameLength } });
  }
  return players;
}

function normalizeStructure(type: StructureType, raw: Record<string, unknown>) {
  switch (type) {
    case 'knockout':
    case 'knockout_consolation':
      return { type, groupCount: 0, advanceA: 0, advanceB: 0 };
    case 'groups':
      return { type, groupCount: 1, advanceA: 0, advanceB: 0 };
    case 'groups_knockout':
      return {
        type,
        groupCount: integer(raw.groupCount),
        advanceA: integer(raw.advanceA),
        // No bracket B unless asked for
        advanceB: raw.advanceB === undefined || raw.advanceB === null ? 0 : integer(raw.advanceB),
      };
  }
}

/**
 * Checks groups + knockout against the group sizes. Also used when pairs are moved
 * between groups, with the actual sizes instead of the even distribution.
 */
export function checkGroups(
  pairCount: number,
  groupCount: number,
  advanceA: number,
  advanceB: number,
  sizes: number[] = groupSizes(pairCount, groupCount),
): Issue[] {
  const maxGroups = Math.min(LIMITS.maxGroups, Math.floor(pairCount / MIN_GROUP_SIZE));
  if (!(groupCount >= 1 && groupCount <= maxGroups)) {
    return [{ code: 'GROUP_COUNT_RANGE', params: { pairs: pairCount, max: maxGroups } }];
  }

  const issues: Issue[] = [];
  const smallest = Math.min(...sizes);
  if (smallest < MIN_GROUP_SIZE) {
    issues.push({ code: 'GROUP_TOO_SMALL', params: { min: MIN_GROUP_SIZE } });
  }
  if (!(advanceA >= 1)) {
    issues.push({ code: 'ADVANCE_A_MIN' });
  } else if (!(advanceB >= 0)) {
    issues.push({ code: 'ADVANCE_B_INVALID' });
  } else {
    if (advanceA + advanceB > smallest) {
      issues.push({
        code: 'ADVANCE_EXCEEDS_GROUP',
        params: { smallest, advance: advanceA + advanceB },
      });
    }
    if (groupCount * advanceA < 2)
      issues.push({ code: 'BRACKET_TOO_SMALL', params: { bracket: 'A' } });
    if (advanceB > 0 && groupCount * advanceB < 2) {
      issues.push({ code: 'BRACKET_TOO_SMALL', params: { bracket: 'B' } });
    }
  }
  return issues;
}
