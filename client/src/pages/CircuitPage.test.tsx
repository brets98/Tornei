import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Circuit } from '../lib/circuits';
import { renderIn } from '../test/render';
import { json, stubApi } from '../test/tournament-fixtures';
import { CircuitPage } from './CircuitPage';
import { PlayersPage } from './PlayersPage';

const points = (first: number) => ({
  places: [first, first / 2, 30, 20, 10, 5, 2],
  groups: 1,
  participation: 10,
});

const circuit: Circuit = {
  id: 'x1',
  name: 'Circuito estivo',
  season: '2027',
  updatedAt: '2026-10-21T10:00:00.000Z',
  categories: [
    { id: 'k1', name: 'Major', points: points(200) },
    { id: 'k2', name: 'P1', points: points(100) },
  ],
  stages: [
    {
      id: 't1',
      name: 'Tappa 1',
      date: '2026-10-20',
      categoryId: 'k2',
      summary: { status: 'finished', matchesDone: 1, matchesTotal: 1 },
    },
  ],
  ranking: [
    {
      playerId: 'a',
      name: 'Rossi',
      points: 110,
      stages: 1,
      wins: 1,
      finals: 1,
      best: 0,
      results: [{ stageId: 't1', place: 'winner', points: 110 }],
    },
    {
      playerId: 'b',
      name: 'Verdi',
      points: 60,
      stages: 1,
      wins: 0,
      finals: 1,
      best: 1,
      results: [{ stageId: 't1', place: 'runnerUp', points: 60 }],
    },
  ],
  unlinked: [{ stageId: 't1', count: 2 }],
};

/** What the API received for `METHOD url`, parsed. */
function sent(fetchMock: ReturnType<typeof stubApi>, method: string, url: string) {
  const call = fetchMock.mock.calls.find(([u, init]) => u === url && init?.method === method);
  return call && JSON.parse(call[1]!.body as string);
}

function renderAt(path: string) {
  renderIn(
    'it',
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="circuits/:id" element={<CircuitPage />} />
        <Route path="players" element={<PlayersPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CircuitPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows the ranking, with each player’s points by stage', async () => {
    stubApi({ 'GET /api/circuits/x1': () => json(circuit) });
    renderAt('/circuits/x1');

    const rows = within(await screen.findByRole('table')).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('1Rossi');
    expect(rows[1]).toHaveTextContent('110');
    expect(rows[1]).toHaveTextContent('Vincitore');
    expect(rows[2]).toHaveTextContent('Finalista');
    expect(within(rows[1]).getByRole('link', { name: 'Tappa 1' })).toHaveAttribute(
      'href',
      '/tournaments/t1',
    );
    expect(screen.getByText(/Tappa 1: 2 nomi non sono collegati/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nuova tappa' })).toHaveAttribute(
      'href',
      '/tournaments/new?circuit=x1',
    );
  });

  it('edits the categories and their points', async () => {
    const fetchMock = stubApi({
      'GET /api/circuits/x1': () => json(circuit),
      'PATCH /api/circuits/x1': () => json(circuit),
    });
    renderAt('/circuits/x1?tab=settings');

    fireEvent.change(await screen.findByLabelText('Punti Vincitore in P1'), {
      target: { value: '150' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rimuovi Major' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi categoria' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salva' }));

    await waitFor(() =>
      expect(sent(fetchMock, 'PATCH', '/api/circuits/x1')).toEqual({
        name: 'Circuito estivo',
        season: '2027',
        categories: [
          { id: 'k2', name: 'P1', points: { ...points(100), places: [150, 50, 30, 20, 10, 5, 2] } },
          { name: 'Categoria 2', points: { ...points(100), places: [150, 50, 30, 20, 10, 5, 2] } },
        ],
      }),
    );
  });

  it('explains why a change is refused', async () => {
    stubApi({
      'GET /api/circuits/x1': () => json(circuit),
      'PATCH /api/circuits/x1': () =>
        json({ issues: [{ code: 'CATEGORY_IN_USE', params: { name: 'P1' } }] }, 400),
    });
    renderAt('/circuits/x1?tab=settings');

    fireEvent.click(await screen.findByRole('button', { name: 'Rimuovi P1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salva' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('La categoria "P1" ha delle tappe');
  });
});

describe('PlayersPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('adds and renames players', async () => {
    const fetchMock = stubApi({
      'GET /api/players': () => json([{ id: 'a', name: 'Rossi' }]),
      'POST /api/players': () => json({ id: 'b', name: 'Bianchi' }, 201),
      'PATCH /api/players/a': () => json({ id: 'a', name: 'Mario Rossi' }),
    });
    renderAt('/players');

    const rossi = await screen.findByLabelText('Nome di Rossi');
    fireEvent.change(screen.getByLabelText('Nuovo giocatore'), { target: { value: 'Bianchi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi' }));
    expect(await screen.findByLabelText('Nome di Bianchi')).toBeInTheDocument();

    fireEvent.change(rossi, { target: { value: 'Mario Rossi' } });
    fireEvent.blur(rossi);
    expect(await screen.findByLabelText('Nome di Mario Rossi')).toBeInTheDocument();
    expect(sent(fetchMock, 'PATCH', '/api/players/a')).toEqual({ name: 'Mario Rossi' });
  });

  it('explains why a player cannot be deleted', async () => {
    stubApi({
      'GET /api/players': () => json([{ id: 'a', name: 'Rossi' }]),
      'DELETE /api/players/a': () =>
        json({ issues: [{ code: 'PLAYER_IN_USE', params: { count: 2 } }] }, 409),
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAt('/players');

    fireEvent.click(await screen.findByRole('button', { name: 'Elimina' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('gioca in 2 tornei');
  });
});
