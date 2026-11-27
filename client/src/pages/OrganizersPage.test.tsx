import { screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { Tournament } from '../lib/tournaments';
import { renderIn } from '../test/render';
import { json, listItem, stubApi, tournament } from '../test/tournament-fixtures';
import { LivePage } from './LivePage';

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
