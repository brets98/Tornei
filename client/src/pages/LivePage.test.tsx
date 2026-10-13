import { act, fireEvent, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Match, Tournament } from '../lib/tournaments';
import { renderIn } from '../test/render';
import { json, listItem, stubApi, tournament } from '../test/tournament-fixtures';
import { LivePage, REFRESH_MS } from './LivePage';

function renderPage(path = '/live') {
  renderIn(
    'it',
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="live" element={<LivePage />} />
        <Route path="live/:id" element={<LivePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** p1 beat p2 6-3 6-4 in group A. */
const scored: Tournament = {
  ...tournament,
  matches: tournament.matches.map((m) =>
    m.id === 'p1-p2'
      ? {
          ...m,
          sets: [
            { a: 6, b: 3 },
            { a: 6, b: 4 },
          ],
          state: 'done',
          winner: 'p1',
        }
      : { ...m, courtId: 'c2', timeSlotId: 't2' },
  ),
};

describe('LivePage', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('lets you choose a tournament, then shows it read-only', async () => {
    stubApi({
      'GET /api/tournaments': () => json([listItem]),
      'GET /api/tournaments/t1': () => json(scored),
    });
    renderPage();

    expect(
      screen.getByText(/Scegli un torneo per seguirne gironi e tabelloni/),
    ).toBeInTheDocument();
    const choose = screen.getByLabelText('Torneo');
    await screen.findByRole('option', { name: 'Torneo di primavera · 20/10/2026' });
    fireEvent.change(choose, { target: { value: 't1' } });

    const groupA = await screen.findByLabelText('Girone A');
    expect(within(groupA).getByText('6-3 6-4')).toBeInTheDocument();
    expect(
      within(screen.getByLabelText('Girone B')).getByText('Mediolanum · 19:30'),
    ).toBeInTheDocument();
    // Nothing to edit: no text fields, and the tournament choice is the only dropdown
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
  });

  it('updates by itself every 30 seconds, and on request', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let answer = tournament;
    const fetchMock = stubApi({
      'GET /api/tournaments': () => json([listItem]),
      'GET /api/tournaments/t1': () => json(answer),
    });
    renderPage('/live/t1');
    const loads = () =>
      fetchMock.mock.calls.filter(([url]) => url === '/api/tournaments/t1').length;

    await screen.findByLabelText('Girone A');
    expect(screen.queryByText('6-3 6-4')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      /Aggiornato alle .* · si aggiorna ogni 30 secondi/,
    );

    answer = scored;
    await act(() => vi.advanceTimersByTimeAsync(REFRESH_MS - 1000));
    expect(loads()).toBe(1);
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(loads()).toBe(2);
    expect(await screen.findByText('6-3 6-4')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Aggiorna ora' }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(loads()).toBe(3);
  });

  it('keeps the last data when an update fails', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let fail = false;
    stubApi({
      'GET /api/tournaments': () => json([listItem]),
      'GET /api/tournaments/t1': () => (fail ? json({ error: 'Down' }, 500) : json(scored)),
    });
    renderPage('/live/t1');
    await screen.findByText('6-3 6-4');

    fail = true;
    await act(() => vi.advanceTimersByTimeAsync(REFRESH_MS));

    expect(await screen.findByRole('alert')).toHaveTextContent('Aggiornamento non riuscito');
    expect(screen.getByText('6-3 6-4')).toBeInTheDocument();
  });

  it('shows the brackets read-only, with court and time', async () => {
    const semifinal = (index: number, changes: Partial<Match>): Match => ({
      id: `A0-${index}`,
      phase: 'knockout',
      bracket: 'A',
      round: 0,
      index,
      pairA: null,
      pairB: null,
      sets: [],
      courtId: null,
      timeSlotId: null,
      state: 'todo',
      winner: null,
      ...changes,
    });
    const knockout: Tournament = {
      ...tournament,
      structure: { type: 'knockout', groupCount: 0, advanceA: 0, advanceB: 0 },
      groups: [],
      seeding: ['p1', 'p2', 'p3', 'p4'],
      brackets: [{ id: 'A', size: 4, champion: null }],
      matches: [
        semifinal(0, { pairA: 'p1', pairB: 'p4', courtId: 'c1', timeSlotId: 't1' }),
        semifinal(1, { pairA: 'p2', pairB: 'p3' }),
        {
          ...semifinal(0, { sourceA: { kind: 'winner', matchId: 'A0-0' } }),
          id: 'A1-0',
          round: 1,
        },
      ],
    };
    stubApi({
      'GET /api/tournaments': () => json([listItem]),
      'GET /api/tournaments/t1': () => json(knockout),
    });
    renderPage('/live/t1');

    const first = await screen.findByLabelText('Semifinale 1');
    expect(within(first).getByText('Bigi · 19:00')).toBeInTheDocument();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.queryByRole('heading', { name: 'Gironi' })).not.toBeInTheDocument();
  });

  /** Groups A and B, then a final between their winners. */
  const withBracket: Tournament = {
    ...tournament,
    brackets: [{ id: 'A', size: 2, champion: null }],
    matches: [
      ...tournament.matches,
      {
        id: 'A0-0',
        phase: 'knockout',
        bracket: 'A',
        round: 0,
        index: 0,
        sourceA: { kind: 'group', groupId: 'A', position: 1 },
        sourceB: { kind: 'group', groupId: 'B', position: 1 },
        pairA: null,
        pairB: null,
        sets: [],
        courtId: null,
        timeSlotId: null,
        state: 'todo',
        winner: null,
      },
    ],
  };

  it('switches between the groups and the bracket', async () => {
    stubApi({
      'GET /api/tournaments': () => json([listItem]),
      'GET /api/tournaments/t1': () => json(withBracket),
    });
    renderPage('/live/t1');

    // Group phase: the groups first
    expect(await screen.findByLabelText('Girone A')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gironi' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByText('1° Girone A')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tabellone A' }));
    expect(screen.getByText('1° Girone A')).toBeInTheDocument();
    expect(screen.queryByLabelText('Girone A')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Gironi' }));
    expect(screen.getByLabelText('Girone A')).toBeInTheDocument();
  });

  it('opens on the bracket once the knockout phase has started', async () => {
    const knockout = { ...withBracket, summary: { ...withBracket.summary, status: 'knockout' } };
    stubApi({
      'GET /api/tournaments': () => json([listItem]),
      'GET /api/tournaments/t1': () => json(knockout),
    });
    renderPage('/live/t1');

    expect(await screen.findByText('1° Girone A')).toBeInTheDocument();
    const switcher = screen.getByRole('navigation', { name: 'Gironi o tabellone' });
    expect(within(switcher).getByRole('button', { name: 'Tabellone A' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('says when the tournament does not exist', async () => {
    stubApi({ 'GET /api/tournaments': () => json([]) });
    renderPage('/live/missing');

    expect(await screen.findByText('Torneo non trovato.')).toBeInTheDocument();
  });
});
