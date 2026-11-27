import { bracketMatches, knockoutMatchId, placeSeeds } from './bracket.js';
import { findConflicts } from './conflicts.js';
import { distribute, groupId, roundRobin, shuffle } from './groups.js';
import { formatOf, outcome } from './score.js';
import { computeStandings, rankAcross, resultState } from './standings.js';
import type {
  Bracket,
  BracketId,
  Group,
  Match,
  MatchFormat,
  MatchState,
  Pair,
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

/**
 * Bracket entrants, strongest first: by group position, then group letter (A1, B1, …, A2, B2,
 * …), or with `crossRanking` by rank across groups (best 1st, second best 1st, …), placed once
 * the groups end. A position counts only the groups that have it (e.g. 4th of a group of 4).
 */
function bracketSources(
  structure: Structure,
  groups: { id: string; size: number }[],
  pairCount: number,
) {
  const fromGroups = (first: number, count: number) =>
    Array.from({ length: count }, (_, p) => {
      const position = first + p;
      const having = groups.filter((g) => g.size >= position);
      return having.map(({ id }, i) =>
        structure.crossRanking
          ? { source: { kind: 'ranked', position, rank: i + 1 } as Source, tier: position }
          : {
              source: { kind: 'group', groupId: id, position } as Source,
              group: id,
              tier: position,
            },
      );
    }).flat();

  const brackets: { id: BracketId; seeds: { source: Source; group?: string; tier: number }[] }[] =
    [];
  if (structure.type === 'knockout' || structure.type === 'knockout_consolation') {
    brackets.push({
      id: 'A',
      seeds: Array.from({ length: pairCount }, (_, index) => ({
        source: { kind: 'seed', index } as Source,
        tier: 0,
      })),
    });
  } else if (structure.type === 'groups_knockout') {
    brackets.push({ id: 'A', seeds: fromGroups(1, structure.advanceA) });
    const largest = Math.max(...groups.map((g) => g.size));
    const advanceB = structure.restToB ? largest - structure.advanceA : structure.advanceB;
    if (advanceB > 0) {
      brackets.push({ id: 'B', seeds: fromGroups(structure.advanceA + 1, advanceB) });
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
    data.groups.map((g) => ({ id: g.id, size: g.pairIds.length })),
    data.pairs.length,
  ).map(({ id, seeds }) => {
    const slots = placeSeeds(seeds).map((seed) => seed?.source ?? null);
    return {
      bracket: { id, size: slots.length, champion: null },
      matches: bracketMatches(id, slots),
    };
  });
  if (data.structure.type === 'knockout_consolation') {
    // One slot per first-round match of A: losers of matches whose winners meet next meet here
    const slots = brackets[0].matches
      .filter((m) => m.round === 0)
      .map((m): Source => ({ kind: 'firstLoser', matchId: m.id }));
    brackets.push({
      bracket: { id: 'C', size: slots.length, champion: null },
      matches: bracketMatches('C', slots),
    });
  }

  const matches = [...data.groups.flatMap(groupMatches), ...brackets.flatMap((b) => b.matches)].map(
    (m) => ({
      ...m,
      courtId: previous.get(m.id)?.courtId ?? null,
      timeSlotId: previous.get(m.id)?.timeSlotId ?? null,
    }),
  );
  return { matches, brackets: brackets.map((b) => b.bracket) };
}

/**
 * The consolation draw: by level (the best get the byes and are kept apart by the bracket
 * placement), at random among pairs of the same level.
 */
export function drawByLevel(pairs: Pair[], random: () => number): string[] {
  return shuffle(pairs, random)
    .sort((a, b) => a.level! - b.level!)
    .map((p) => p.id);
}

/**
 * A new tournament from a valid setup (see `parseSetup`), with the consolation draw made by
 * level (it can be redrawn until the first result: `draw()`).
 */
export function buildTournament(setup: Setup, random: () => number = Math.random): TournamentData {
  const { pairCount, structure } = setup;
  const empty = setup.format === 'singles' ? [''] : ['', ''];
  const pairs: Pair[] = Array.from({ length: pairCount }, (_, i) => ({
    id: `p${i + 1}`,
    players: [...(setup.players?.[i] ?? empty)],
    ...(setup.levels && { level: setup.levels[i] }),
  }));
  const pairIds = pairs.map((p) => p.id);
  const groups: Group[] = distribute(pairIds, structure.groupCount).map((pairIds, i) => ({
    id: groupId(i),
    pairIds,
    standings: [],
    complete: false,
  }));

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
    groupMatchFormat: setup.groupMatchFormat,
    pairs,
    groups,
    seeding:
      structure.type === 'knockout'
        ? pairIds
        : structure.type === 'knockout_consolation'
          ? drawByLevel(pairs, random)
          : [],
    matches: [],
    brackets: [],
    summary: { status: 'draft', matchesDone: 0, matchesTotal: 0 },
    conflicts: [],
  };
  return refreshTournament({ ...data, ...buildMatches(data) });
}

/** A consolation side that will never be filled: the other side goes through. */
const NOBODY = Symbol('nobody');

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
    const state = resultState(m, formatOf(data, m));
    matches.set(m.id, { ...m, state, winner: winnerOf(m, state, formatOf(data, m)) });
  }

  const groups = data.groups.map((g) => {
    const played = groupMatchesOf(g.id).map((m) => matches.get(m.id)!);
    return {
      ...g,
      standings: computeStandings(g.pairIds, played, data.groupMatchFormat ?? data.matchFormat),
      complete: played.length > 0 && played.every((m) => m.state === 'done'),
    };
  });
  const groupsById = new Map(groups.map((g) => [g.id, g]));

  // Cross ranking: once every group is done, each bracket's pairs are ranked across groups
  // and placed (byes to the best, pairs of the same group kept apart)
  const placed = new Map<string, (string | null)[]>();
  if (data.structure.crossRanking && groups.length > 0 && groups.every((g) => g.complete)) {
    const played = [...matches.values()];
    const format = data.groupMatchFormat ?? data.matchFormat;
    for (const bracket of data.brackets) {
      const positions = new Set(
        data.matches
          .filter((m) => m.bracket === bracket.id && m.round === 0)
          .flatMap((m) => [m.sourceA, m.sourceB])
          .flatMap((s) => (s?.kind === 'ranked' ? [s.position] : [])),
      );
      if (positions.size === 0) continue;
      const seeds = [...positions]
        .sort((a, b) => a - b)
        .flatMap((position) =>
          rankAcross(groups, played, format, position).map(({ pairId, groupId }) => ({
            pairId,
            group: groupId,
            tier: position,
          })),
        );
      placed.set(
        bracket.id,
        placeSeeds(seeds).map((seed) => seed?.pairId ?? null),
      );
    }
  }

  /** The pair on one side, null while not known, NOBODY when the side turned out empty. */
  const resolve = (source: Source | undefined): string | null | typeof NOBODY => {
    switch (source?.kind) {
      case 'group': {
        const group = groupsById.get(source.groupId);
        return group?.complete ? (group.standings[source.position - 1]?.pairId ?? null) : null;
      }
      case 'seed':
        return data.seeding[source.index] ?? null;
      case 'winner':
        return matches.get(source.matchId)?.winner ?? null;
      case 'firstLoser': {
        const first = matches.get(source.matchId);
        if (!first) return null;
        if (first.state !== 'bye') {
          if (!first.winner) return null;
          return first.winner === first.pairA ? first.pairB : first.pairA;
        }
        // After a bye the first match is the next one: only its loser comes here
        const next = matches.get(knockoutMatchId(first.bracket!, 1, Math.floor(first.index! / 2)));
        if (!next?.winner || !first.winner) return null;
        return next.winner === first.winner ? NOBODY : first.winner;
      }
      default:
        return null;
    }
  };

  // Rounds in order, so a winner is known before the next round reads it; the consolation
  // bracket (C) after the main one, whose results fill it
  const knockout = data.matches
    .filter((m) => m.phase === 'knockout')
    .sort(
      (a, b) => a.bracket!.localeCompare(b.bracket!) || a.round! - b.round! || a.index! - b.index!,
    );
  for (const m of knockout) {
    const slots = m.round === 0 ? placed.get(m.bracket!) : undefined;
    const side = (source: Source | undefined, k: number) =>
      source?.kind === 'ranked' ? (slots?.[2 * m.index! + k] ?? null) : resolve(source);
    const sideA = side(m.sourceA, 0);
    const sideB = side(m.sourceB, 1);
    const pairA = sideA === NOBODY ? null : sideA;
    const pairB = sideB === NOBODY ? null : sideB;
    const resolved = { ...m, pairA, pairB };

    if (m.sourceA?.kind === 'bye' || m.sourceB?.kind === 'bye') {
      matches.set(m.id, { ...resolved, state: 'bye', winner: pairA ?? pairB });
      continue;
    }
    if (sideA === NOBODY || sideB === NOBODY) {
      // A walkover found out late: a score entered before no longer counts
      const state = m.sets.length > 0 ? 'stale' : 'bye';
      matches.set(m.id, { ...resolved, state, winner: state === 'bye' ? (pairA ?? pairB) : null });
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
