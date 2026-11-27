import { fireEvent, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import type { Tournament } from '../lib/tournaments';
import { renderIn } from '../test/render';
import { json, listItem, stubApi, tournament } from '../test/tournament-fixtures';
import { LivePage } from './LivePage';
import { SharedSchedulePage } from './SharedSchedulePage';

function renderPage(path: string) {
  renderIn(
    'it',
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="organizers" element={<LivePage mode="organizers" />} />
        <Route path="organizers/:id" element={<LivePage mode="organizers" />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** p1-p2 on Bigi at 19:00 (p1 won), p3-p4 with no court or time. */
const scheduled: Tournament = {
  ...tournament,
  matches: tournament.matches.map((m) =>
    m.id === 'p1-p2'
      ? {
          ...m,
          courtId: 'c1',
          timeSlotId: 't1',
          sets: [
            { a: 6, b: 3 },
            { a: 6, b: 4 },
          ],
          state: 'done',
          winner: 'p1',
        }
      : m,
  ),
};

describe('Organizers page', () => {
  it('lists the tournaments, each opening its schedule', async () => {
    stubApi({ 'GET /api/tournaments': () => json([listItem]) });
    renderPage('/organizers');
    expect(screen.getByRole('heading', { name: 'Organizzatori' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Torneo di primavera/ })).toHaveAttribute(
      'href',
      '/organizers/t1',
    );
  });

  it('shows the matches by court and time, and those without a time below', async () => {
    stubApi({
      'GET /api/tournaments': () => json([listItem]),
      'GET /api/tournaments/t1': () => json(scheduled),
    });
    renderPage('/organizers/t1');

    const grid = await screen.findByRole('table');
    expect(within(grid).getByRole('columnheader', { name: 'Bigi' })).toBeInTheDocument();
    expect(within(grid).getByRole('columnheader', { name: 'Mediolanum' })).toBeInTheDocument();
    const row = within(grid).getByRole('row', { name: /19:00/ });
    expect(row).toHaveTextContent('Girone A');
    expect(row).toHaveTextContent('Rossi / Bianchi');
    expect(row).toHaveTextContent('6-3 6-4');
    // Only the times with matches, no groups or brackets switch
    expect(within(grid).queryByRole('row', { name: /19:30/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Gironi o tabelloni' }),
    ).not.toBeInTheDocument();

    const unscheduled = screen.getByRole('heading', { name: 'Senza orario' }).parentElement!;
    expect(unscheduled).toHaveTextContent('Girone B');
  });
});

describe('Organizers: all tournaments', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('puts every tournament of the day in one grid, courts matched by name', async () => {
    const other: Tournament = {
      ...scheduled,
      id: 't2',
      name: 'Open d’autunno',
      // Same court name in other case, different ids: the same court
      courts: [{ id: 'c7', name: 'BIGI' }],
      timeSlots: [{ id: 't9', time: '19:00' }],
      matches: scheduled.matches.map((m) =>
        m.id === 'p3-p4' ? { ...m, courtId: 'c7', timeSlotId: 't9' } : m,
      ),
    };
    stubApi({
      'GET /api/tournaments': () =>
        json([listItem, { ...listItem, id: 't2', name: 'Open d’autunno' }]),
      'GET /api/tournaments/t1': () => json(scheduled),
      'GET /api/tournaments/t2': () => json(other),
    });
    renderIn(
      'it',
      <MemoryRouter initialEntries={['/organizers/all']}>
        <Routes>
          <Route path="organizers/all" element={<SharedSchedulePage />} />
        </Routes>
      </MemoryRouter>,
    );

    const grid = await screen.findByRole('table');
    expect(screen.getByRole('heading', { name: 'Tutti i tornei' })).toBeInTheDocument();
    expect(within(grid).getAllByRole('columnheader', { name: /bigi/i })).toHaveLength(1);
    const row = within(grid).getByRole('row', { name: /19:00/ });
    expect(row).toHaveTextContent('Torneo di primavera');
    expect(row).toHaveTextContent('Open d’autunno');
    // Both tournaments use the same court at 19:00
    expect(within(row).getAllByText('Sovrapposizione')).toHaveLength(2);

    // A chip per court: switching Bigi off leaves it out with its matches, and it is remembered
    const chips = screen.getByRole('group', { name: 'Campi visualizzati' });
    const bigi = within(chips).getByRole('button', { name: 'Bigi' });
    expect(within(chips).getAllByRole('button')).toHaveLength(2);
    expect(bigi).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(bigi);
    expect(bigi).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('columnheader', { name: /bigi/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /19:00/ })).not.toBeInTheDocument();
    expect(localStorage.getItem('tornei.organizers.hiddenCourts')).toBe('["bigi"]');
    fireEvent.click(bigi);
    expect(
      within(screen.getByRole('table')).getAllByRole('columnheader', { name: /bigi/i }),
    ).toHaveLength(1);
  });
});
