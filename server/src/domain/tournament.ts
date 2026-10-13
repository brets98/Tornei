import { bracketMatches, placeSeeds } from './bracket.js';
import { findConflicts } from './conflicts.js';
import { distribute, groupId, roundRobin } from './groups.js';
import { outcome } from './score.js';
import { computeStandings, resultState } from './standings.js';
import type {
  Bracket,
  BracketId,
  Group,
  Match,
  MatchFormat,
  MatchState,
  Setup,
  Source,
  Structure,
  Summary,
  TournamentData,
  TournamentStatus,
} from './types.js';

export function groupMatches(group: { id: string; pairIds: string[] }): Match[] {
  return roundRobin(group.pairIds).map(([pairA, pairB]) => ({
    id: `${pairA}-${pairB}`,
    phase: 'group',
    groupId: group.id,
    pairA,
    pairB,
    sets: [],
    courtId: null,
    timeSlotId: null,
    state: 'todo',
    winner: null,
  }));
}

/** Bracket entrants, strongest first: by group position, then group letter (A1, B1, …, A2, B2, …). */
function bracketSources(structure: Structure, groupIds: string[], pairCount: number) {
  const fromGroups = (first: number, count: number) =>
    Array.from({ length: count }, (_, p) =>
      groupIds.map((id) => ({
        source: { kind: 'group', groupId: id, position: first + p } as Source,
        group: id,
        tier: first + p,
      })),
    ).flat();

  const brackets: { id: BracketId; seeds: { source: Source; group?: string; tier: number }[] }[] =
    [];
  if (structure.type === 'knockout') {
    brackets.push({
      id: 'A',
      seeds: Array.from({ length: pairCount }, (_, index) => ({
        source: { kind: 'seed', index } as Source,
        tier: 0,
      })),
    });
  } else if (structure.type === 'groups_knockout') {
    brackets.push({ id: 'A', seeds: fromGroups(1, structure.advanceA) });
    if (structure.advanceB > 0) {
      brackets.push({ id: 'B', seeds: fromGroups(structure.advanceA + 1, structure.advanceB) });
    }
  }
  return brackets;
}

/**
 * Group and bracket matches for the current pairs and groups. Results are cleared, but a
 * match that still exists keeps its court and time slot.
 */
export function buildMatches(
  data: Pick<TournamentData, 'structure' | 'groups' | 'pairs' | 'matches'>,
): { matches: Match[]; brackets: Bracket[] } {
  const previous = new Map(data.matches.map((m) => [m.id, m]));
  const brackets = bracketSources(
    data.structure,
    data.groups.map((g) => g.id),
    data.pairs.length,
  ).map(({ id, seeds }) => {
    const slots = placeSeeds(seeds).map((seed) => seed?.source ?? null);
    return {
      bracket: { id, size: slots.length, champion: null },
      matches: bracketMatches(id, slots),
    };
  });

  const matches = [...data.groups.flatMap(groupMatches), ...brackets.flatMap((b) => b.matches)].map(
    (m) => ({
      ...m,
      courtId: previous.get(m.id)?.courtId ?? null,
      timeSlotId: previous.get(m.id)?.timeSlotId ?? null,
    }),
  );
  return { matches, brackets: brackets.map((b) => b.bracket) };
}

/** A new tournament from a valid setup (see `parseSetup`). */
export function buildTournament(setup: Setup): TournamentData {
  const { pairCount, structure } = setup;
  const players = setup.format === 'singles' ? [''] : ['', ''];
  const pairs = Array.from({ length: pairCount }, (_, i) => ({
    id: `p${i + 1}`,
    players: [...players],
  }));
  const groups: Group[] = distribute(
    pairs.map((p) => p.id),
    structure.groupCount,
  ).map((pairIds, i) => ({ id: groupId(i), pairIds, standings: [], complete: false }));

  const data: TournamentData = {
    name: setup.name,
    subtitle: setup.subtitle,
    sport: setup.sport,
    format: setup.format,
    date: setup.date,
    courts: setup.courts.map((name, i) => ({ id: `c${i + 1}`, name })),
    timeSlots: setup.timeSlots.map((time, i) => ({ id: `t${i + 1}`, time })),
    structure,
    matchFormat: setup.matchFormat,
    pairs,
    groups,
    seeding: structure.type === 'knockout' ? pairs.map((p) => p.id) : [],
    matches: [],
    brackets: [],
    summary: { status: 'draft', matchesDone: 0, matchesTotal: 0 },
    conflicts: [],
  };
  return refreshTournament({ ...data, ...buildMatches(data) });
}

type Derived = Pick<TournamentData, 'groups' | 'matches' | 'brackets' | 'summary' | 'conflicts'>;

/**
 * Recomputes everything that follows from the setup, the schedule and the scores: match
 * states and winners, standings, who plays each knockout match, champions, the summary and
 * the scheduling conflicts.
 */
export function refreshTournament<T extends TournamentData>(data: T): T & Derived {
  const groupMatchesOf = (id: string) =>
    data.matches.filter((m) => m.phase === 'group' && m.groupId === id);

  const matches = new Map<string, Match>();
  for (const m of data.matches.filter((m) => m.phase === 'group')) {
    const state = resultState(m, data.matchFormat);
    matches.set(m.id, { ...m, state, winner: winnerOf(m, state, data.matchFormat) });
  }

  const groups = data.groups.map((g) => {
    const played = groupMatchesOf(g.id).map((m) => matches.get(m.id)!);
    return {
      ...g,
      standings: computeStandings(g.pairIds, played, data.matchFormat),
      complete: played.length > 0 && played.every((m) => m.state === 'done'),
    };
  });
  const groupsById = new Map(groups.map((g) => [g.id, g]));

  const resolve = (source: Source | undefined): string | null => {
    switch (source?.kind) {
      case 'group': {
        const group = groupsById.get(source.groupId);
        return group?.complete ? (group.standings[source.position - 1]?.pairId ?? null) : null;
      }
      case 'seed':
        return data.seeding[source.index] ?? null;
      case 'winner':
        return matches.get(source.matchId)?.winner ?? null;
      default:
        return null;
    }
  };

  // Rounds in order, so a winner is known before the next round reads it
  const knockout = data.matches
    .filter((m) => m.phase === 'knockout')
    .sort((a, b) => a.round! - b.round! || a.index! - b.index!);
  for (const m of knockout) {
    const pairA = resolve(m.sourceA);
    const pairB = resolve(m.sourceB);
    const resolved = { ...m, pairA, pairB };

    if (m.sourceA?.kind === 'bye' || m.sourceB?.kind === 'bye') {
      matches.set(m.id, { ...resolved, state: 'bye', winner: pairA ?? pairB });
      continue;
    }
    let state: MatchState = resultState(m, data.matchFormat);
    const scored = m.scoredPairs ?? [];
    if (state !== 'todo' && (scored[0] !== pairA || scored[1] !== pairB || !pairA || !pairB)) {
      state = 'stale';
    }
    matches.set(m.id, {
      ...resolved,
      state,
      winner: winnerOf(resolved, state, data.matchFormat),
    });
  }

  const allMatches = data.matches.map((m) => matches.get(m.id)!);
  const brackets = data.brackets.map((b) => {
    const final = allMatches.find((m) => m.bracket === b.id && 2 ** (m.round! + 1) === b.size);
    return { ...b, champion: final?.winner ?? null };
  });

  return {
    ...data,
    groups,
    matches: allMatches,
    brackets,
    summary: summarize(data.structure, groups, allMatches, brackets),
    conflicts: findConflicts(
      allMatches,
      data.timeSlots.map((s) => s.id),
    ),
  };
}

function winnerOf(m: Match, state: Match['state'], format: MatchFormat) {
  if (state !== 'done') return null;
  return outcome(m.sets, format).winner === 'A' ? m.pairA : m.pairB;
}

function summarize(
  structure: Structure,
  groups: Group[],
  matches: Match[],
  brackets: Bracket[],
): Summary {
  const playable = matches.filter((m) => m.state !== 'bye');
  const matchesDone = playable.filter((m) => m.state === 'done').length;
  const started = matches.some((m) => m.sets.length > 0);

  let status: TournamentStatus;
  if (!started) status = 'draft';
  else if (structure.type === 'groups')
    status = groups.every((g) => g.complete) ? 'finished' : 'groups';
  else if (!groups.every((g) => g.complete)) status = 'groups';
  else status = brackets.every((b) => b.champion) ? 'finished' : 'knockout';

  return { status, matchesDone, matchesTotal: playable.length };
}
