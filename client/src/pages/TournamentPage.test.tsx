import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, stubApi, tournament } from '../test/tournament-fixtures';
import { TournamentPage } from './TournamentPage';

function renderPage(id = 't1') {
  render(
    <MemoryRouter initialEntries={[`/tournaments/${id}`]}>
      <Routes>
        <Route path="tournaments/:id" element={<TournamentPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TournamentPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the overview: stats, groups, courts and time slots', async () => {
    stubApi({ 'GET /api/tournaments/t1': () => json(tournament) });
    renderPage();

    expect(await screen.findByRole('heading', { name: /Torneo di primavera/ })).toBeInTheDocument();
    expect(screen.getByText('Torneo Padel')).toBeInTheDocument();
    expect(screen.getByText('3/22')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Girone A' })).toBeInTheDocument();
    // Pairs by their players' names, or by code while the names are empty
    expect(screen.getByText('Rossi / Bianchi')).toBeInTheDocument();
    expect(screen.getAllByText('B2')).toHaveLength(2);
    expect(screen.getByText('Mediolanum')).toBeInTheDocument();
    expect(screen.getByText('19:00 · 19:30')).toBeInTheDocument();
  });

  it('says when the tournament does not exist', async () => {
    stubApi({});
    renderPage('missing');

    expect(await screen.findByText('Torneo non trovato.')).toBeInTheDocument();
  });
});
