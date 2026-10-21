import { vi } from 'vitest';
import type { TournamentActions } from '../components/tournament/actions';
import type { Match, StandingRow, Tournament, TournamentListItem } from '../lib/tournaments';

export const row = (pairId: string, changes: Partial<StandingRow> = {}): StandingRow => ({
  pairId,
  played: 0,
  wins: 0,
  losses: 0,
  setsFor: 0,
  setsAgainst: 0,
  gamesFor: 0,
  gamesAgainst: 0,
  ...changes,
});

export const groupMatch = (groupId: string, pairA: string, pairB: string): Match => ({
  id: `${pairA}-${pairB}`,
  phase: 'group',
  groupId,
  pairA,
  pairB,
  sets: [],
  courtId: null,
  timeSlotId: null,
  state: 'todo',
  winner: null,
});

/** Tournament actions that only record their calls. */
export const mockActions = (): TournamentActions => ({
  setPlayers: vi.fn(),
  setLevel: vi.fn(),
  resetBracket: vi.fn(),
  updateMatch: vi.fn(),
  setGroups: vi.fn(),
  draw: vi.fn(),
  updateSettings: vi.fn(),
  resetResults: vi.fn(),
  reportUnreadable: vi.fn(),
});

export const json = (body: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status });

type Handler = (body: unknown) => Response;

/**
 * Stubs fetch with one handler per 'METHOD /api/path'; returns the mock to inspect calls.
 * Unknown requests answer 404.
 */
export function stubApi(routes: Record<string, Handler>) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const handler = routes[`${init?.method ?? 'GET'} ${url}`];
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    return Promise.resolve(handler ? handler(body) : json({ error: 'Not found' }, 404));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export const listItem: TournamentListItem = {
  id: 't1',
  name: 'Torneo di primavera',
  subtitle: 'Gironi',
  sport: 'padel',
  format: 'doubles',
  date: '2026-10-20',
  summary: { status: 'groups', matchesDone: 3, matchesTotal: 22 },
};

export const tournament: Tournament = {
  ...listItem,
  updatedAt: '2026-10-13T10:00:00.000Z',
  courts: [
    { id: 'c1', name: 'Bigi' },
    { id: 'c2', name: 'Mediolanum' },
  ],
  timeSlots: [
    { id: 't1', time: '19:00' },
    { id: 't2', time: '19:30' },
  ],
  structure: { type: 'groups_knockout', groupCount: 2, advanceA: 1, advanceB: 0 },
  matchFormat: { bestOf: 3, gamesPerSet: 6, decider: 'set' },
  pairs: [
    { id: 'p1', players: ['Rossi', 'Bianchi'] },
    { id: 'p2', players: ['', ''] },
    { id: 'p3', players: ['', ''] },
    { id: 'p4', players: ['', ''] },
  ],
  groups: [
    { id: 'A', pairIds: ['p1', 'p2'], standings: [row('p1'), row('p2')], complete: false },
    { id: 'B', pairIds: ['p3', 'p4'], standings: [row('p3'), row('p4')], complete: false },
  ],
  seeding: [],
  matches: [groupMatch('A', 'p1', 'p2'), groupMatch('B', 'p3', 'p4')],
  brackets: [],
  conflicts: [],
};
