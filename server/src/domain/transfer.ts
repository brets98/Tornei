import { setGroups, setPlayers, type EditResult } from './edit.js';
import { checkSets, cleanSets, formatOf } from './score.js';
import { LEVELS, normalizeTime, parseSetup } from './setup.js';
import { buildTournament, refreshTournament } from './tournament.js';
import type { SetScore, TournamentData } from './types.js';

/** Identifies an exported tournament file; bump the version when the format changes. */
export const EXPORT_FORMAT = 'tornei.tournament';
export const EXPORT_VERSION = 5;
/**
 * Versions still read: 1 has no `groupMatchFormat`, 1–2 no `restToB`/`crossRanking`, 1–3
 * always number pairs p1…pN, and 1–4 have no set with the tie-break at 5-5 (`tiebreakAt`).
 */
const READ_VERSIONS: unknown[] = [1, 2, 3, 4, 5];

/**
 * What a tournament file holds: the setup, pairs, groups or seeding, and each match's result
 * and schedule. Derived state (standings, bracket sides, winners, summary) is left out and
 * recomputed on import.
 */
export function exportTournament(data: TournamentData) {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    tournament: {
      name: data.name,
      subtitle: data.subtitle,
      sport: data.sport,
      format: data.format,
      date: data.date,
      structure: data.structure,
      matchFormat: data.matchFormat,
      groupMatchFormat: data.groupMatchFormat ?? null,
      courts: data.courts.map(({ id, name }) => ({ id, name })),
      timeSlots: data.timeSlots.map(({ id, time }) => ({ id, time })),
      pairs: data.pairs.map(({ id, players, level }) => ({ id, players, ...(level && { level }) })),
      groups: data.groups.map(({ id, pairIds }) => ({ id, pairIds })),
      seeding: data.seeding,
      matches: data.matches.map((m) => ({
        id: m.id,
        sets: cleanSets(m.sets),
        courtId: m.courtId,
        timeSlotId: m.timeSlotId,
        ...(m.scoredPairs?.length && { scoredPairs: m.scoredPairs }),
      })),
    },
  };
}

const invalid = (): EditResult => ({ issues: [{ code: 'IMPORT_INVALID' }] });
const object = (value: unknown) =>
  (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<
    string,
    unknown
  >;
const objects = (value: unknown) => (Array.isArray(value) ? value.map(object) : null);
const isId = (prefix: string) => (id: unknown) =>
  typeof id === 'string' && new RegExp(`^${prefix}[1-9]\\d{0,3}$`).test(id);
const unique = (values: unknown[]) => new Set(values).size === values.length;

/**
 * A new tournament from an exported file, checked as strictly as if it had been typed in: the
 * setup like the wizard's, players, groups and every result against the match format. Setup
 * problems answer the wizard's issue codes; anything else malformed is `IMPORT_INVALID`.
 */
export function importTournament(file: unknown): EditResult {
  const root = object(file);
  if (root.format !== EXPORT_FORMAT) return invalid();
  if (!READ_VERSIONS.includes(root.version)) {
    return { issues: [{ code: 'IMPORT_VERSION', params: { version: String(root.version) } }] };
  }
  const t = object(root.tournament);
  const courts = objects(t.courts);
  const slots = objects(t.timeSlots);
  const pairs = objects(t.pairs);
  const matches = objects(t.matches);
  if (!courts || !slots || !pairs || !matches) return invalid();

  const { setup, issues } = parseSetup({
    ...t,
    pairCount: pairs.length,
    players: pairs.map((p) => p.players),
    // Files from before levels: everyone at the default level
    levels: pairs.map((p) => p.level ?? LEVELS),
    courts: courts.map((c) => c.name),
    timeSlots: slots.map((s) => s.time),
  });
  if (issues.length > 0) return { issues };

  // Ids are kept, so the schedule and results below still point to the right court and slot
  const courtIds = courts.map((c) => c.id);
  const slotIds = slots.map((s) => s.id);
  if (!courtIds.every(isId('c')) || !unique(courtIds)) return invalid();
  if (!slotIds.every(isId('t')) || !unique(slotIds)) return invalid();
  // Pair ids are kept too: p1…pN, with gaps where pairs were removed from groups
  const pairIds = pairs.map((p) => p.id);
  if (!pairIds.every(isId('p')) || !unique(pairIds)) return invalid();

  const built = buildTournament(setup);
  const rename = new Map(built.pairs.map((p, i) => [p.id, pairIds[i] as string]));
  let data: TournamentData = {
    ...built,
    pairs: built.pairs.map((p) => ({ ...p, id: rename.get(p.id)! })),
    groups: built.groups.map((g) => ({ ...g, pairIds: g.pairIds.map((id) => rename.get(id)!) })),
    seeding: built.seeding.map((id) => rename.get(id)!),
    courts: courts.map((c, i) => ({ id: c.id as string, name: setup.courts[i] })),
    timeSlots: slots
      .map((s) => ({ id: s.id as string, time: normalizeTime(String(s.time))! }))
      .sort((a, b) => a.time.localeCompare(b.time)),
  };
  for (const pair of pairs) {
    const result = setPlayers(data, pair.id as string, pair.players);
    if (result.issues) return result;
    data = result.data;
  }
  if (data.groups.length > 0) {
    const result = setGroups(data, t.groups);
    if (result.issues) return result;
    data = result.data;
  } else if (data.seeding.length > 0) {
    const seeding = Array.isArray(t.seeding) ? t.seeding : [];
    if (seeding.length !== data.pairs.length || !data.pairs.every((p) => seeding.includes(p.id))) {
      return invalid();
    }
    data = { ...data, seeding: seeding as string[] };
  }

  const byId = new Map(data.matches.map((m) => [m.id, m]));
  for (const m of matches) {
    const match = byId.get(m.id as string);
    if (!match) return invalid();
    const sets = m.sets ?? [];
    const issue = checkSets(sets, formatOf(data, match));
    if (issue) return { issues: [issue] };
    if (match.state === 'bye' && Array.isArray(sets) && sets.length > 0) return invalid();
    const courtId = m.courtId ?? null;
    const timeSlotId = m.timeSlotId ?? null;
    if (courtId !== null && !courtIds.includes(courtId)) return invalid();
    if (timeSlotId !== null && !slotIds.includes(timeSlotId)) return invalid();
    const scoredPairs = m.scoredPairs ?? [];
    if (
      !Array.isArray(scoredPairs) ||
      (scoredPairs.length !== 0 && scoredPairs.length !== 2) ||
      !scoredPairs.every((p) => pairIds.includes(p))
    ) {
      return invalid();
    }
    byId.set(match.id, {
      ...match,
      sets: cleanSets(sets as SetScore[]),
      courtId: courtId as string | null,
      timeSlotId: timeSlotId as string | null,
      ...(match.phase === 'knockout' && { scoredPairs: scoredPairs as string[] }),
    });
  }

  return {
    data: refreshTournament({ ...data, matches: data.matches.map((m) => byId.get(m.id)!) }),
  };
}
