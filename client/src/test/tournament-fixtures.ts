import { vi } from 'vitest';
import type { Tournament, TournamentListItem } from '../lib/tournaments';

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
  courts: [
    { id: 'c1', name: 'Bigi' },
    { id: 'c2', name: 'Mediolanum' },
  ],
  timeSlots: [
    { id: 't1', time: '19:00' },
    { id: 't2', time: '19:30' },
  ],
  structure: { type: 'groups_knockout', groupCount: 2, advanceA: 1, advanceB: 0 },
  pairs: [
    { id: 'p1', players: ['Rossi', 'Bianchi'] },
    { id: 'p2', players: ['', ''] },
    { id: 'p3', players: ['', ''] },
    { id: 'p4', players: ['', ''] },
  ],
  groups: [
    { id: 'A', pairIds: ['p1', 'p2'] },
    { id: 'B', pairIds: ['p3', 'p4'] },
  ],
  seeding: [],
};
