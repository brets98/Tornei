import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Tournament } from '../lib/tournaments';
import { renderIn } from '../test/render';
import { json, row, stubApi, tournament } from '../test/tournament-fixtures';
import { TournamentPage } from './TournamentPage';

function renderPage(path = '/tournaments/t1') {
  renderIn(
    'it',
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="tournaments/:id" element={<TournamentPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const groupsTab = '/tournaments/t1?tab=groups';

/** What the API received for `METHOD url`, parsed. */
function sent(fetchMock: ReturnType<typeof stubApi>, method: string, url: string) {
  const call = fetchMock.mock.calls.find(([u, init]) => u === url && init?.method === method);
  return call && JSON.parse(call[1]!.body as string);
}

/** p1 beat p2 6-3 7-6(4) in group A, as the server would answer. */
const result = [
  { a: 6, b: 3 },
  { a: 7, b: 6, tiebreak: { a: 7, b: 4 } },
];
const afterScore: Tournament = {
  ...tournament,
  summary: { status: 'groups', matchesDone: 1, matchesTotal: 2 },
  matches: tournament.matches.map((m) =>
    m.id === 'p1-p2' ? { ...m, sets: result, state: 'done', winner: 'p1' } : m,
  ),
  groups: tournament.groups.map((g) =>
    g.id === 'A'
      ? {
          ...g,
          standings: [
            row('p1', { played: 1, wins: 1, setsFor: 2, gamesFor: 13, gamesAgainst: 9 }),
            row('p2', { played: 1, losses: 1, setsAgainst: 2, gamesFor: 9, gamesAgainst: 13 }),
          ],
        }
      : g,
  ),
};

describe('TournamentPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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
    renderPage('/tournaments/missing');

    expect(await screen.findByText('Torneo non trovato.')).toBeInTheDocument();
  });

  it('opens the groups tab from the menu of tabs', async () => {
    stubApi({ 'GET /api/tournaments/t1': () => json(tournament) });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Gironi' }));

    expect(screen.getByText('GIRONE A')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: 'Classifica' })).toHaveLength(2);
  });

  it('shows the entries in seed order for a knockout without groups', async () => {
    const knockout: Tournament = {
      ...tournament,
      structure: { type: 'knockout', groupCount: 0, advanceA: 0, advanceB: 0 },
      groups: [],
      seeding: ['p3', 'p1', 'p2', 'p4'],
      matches: [],
    };
    stubApi({ 'GET /api/tournaments/t1': () => json(knockout) });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Iscritti' }));

    expect(screen.queryByRole('button', { name: 'Gironi' })).not.toBeInTheDocument();
    // p1 is second in the seeding
    expect(screen.getByLabelText('Giocatore 1 di 2')).toHaveValue('Rossi');
    expect(screen.getByRole('button', { name: 'Sorteggio casuale' })).toBeInTheDocument();
  });

  it('has a tab per bracket and warns about results that no longer count', async () => {
    const withBrackets: Tournament = {
      ...tournament,
      brackets: [
        { id: 'A', size: 2, champion: null },
        { id: 'B', size: 2, champion: null },
      ],
      matches: [
        ...tournament.matches,
        {
          ...tournament.matches[0],
          id: 'A0-0',
          phase: 'knockout',
          groupId: undefined,
          bracket: 'A',
          round: 0,
          index: 0,
          sets: result,
          state: 'stale',
        },
      ],
    };
    stubApi({ 'GET /api/tournaments/t1': () => json(withBrackets) });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Tabellone B' }));

    expect(screen.getByRole('heading', { name: 'Tabellone B' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'risultato che non vale più perché sono cambiate le coppie: 1.',
    );
  });

  describe('groups tab', () => {
    it('saves the player names when leaving the field', async () => {
      const fetchMock = stubApi({
        'GET /api/tournaments/t1': () => json(tournament),
        'PATCH /api/tournaments/t1/pairs/p2': (body) =>
          json({
            ...tournament,
            pairs: tournament.pairs.map((p) =>
              p.id === 'p2' ? { ...p, players: (body as { players: string[] }).players } : p,
            ),
          }),
      });
      renderPage(groupsTab);

      const input = await screen.findByLabelText('Giocatore 1 di A2');
      fireEvent.change(input, { target: { value: 'Verdi' } });
      expect(fetchMock).not.toHaveBeenCalledWith('/api/tournaments/t1/pairs/p2', expect.anything());
      fireEvent.blur(input);

      expect(await screen.findByText('Salvato')).toBeInTheDocument();
      expect(sent(fetchMock, 'PATCH', '/api/tournaments/t1/pairs/p2')).toEqual({
        players: ['Verdi', ''],
      });
      // The pair now goes by its player's name
      const standings = screen.getAllByRole('table')[1];
      expect(within(standings).getByText('Verdi')).toBeInTheDocument();
    });

    it('saves a result set by set and shows the standings computed by the server', async () => {
      const fetchMock = stubApi({
        'GET /api/tournaments/t1': () => json(tournament),
        'PATCH /api/tournaments/t1/matches/p1-p2': () => json(afterScore),
      });
      renderPage(groupsTab);

      const input = await screen.findByLabelText('Risultato di Rossi / Bianchi – A2');
      expect(input).toHaveAttribute('placeholder', '6-4 3-6 7-6(5)');
      fireEvent.change(input, { target: { value: '6-3 7-6 (4)' } });
      fireEvent.blur(input);

      expect(await screen.findByText('Giocata')).toBeInTheDocument();
      expect(sent(fetchMock, 'PATCH', '/api/tournaments/t1/matches/p1-p2')).toEqual({
        sets: result,
      });
      expect(input).toHaveValue('6-3 7-6(4)');
      const standings = screen.getAllByRole('table')[1];
      const leader = within(standings).getAllByRole('row')[1];
      expect(leader).toHaveClass('leader');
      // Sets +2, games +4
      expect(within(leader).getByText('+2')).toBeInTheDocument();
      expect(within(leader).getByText('+4')).toBeInTheDocument();
    });

    it('explains a result it cannot read, and saves nothing', async () => {
      const fetchMock = stubApi({ 'GET /api/tournaments/t1': () => json(tournament) });
      renderPage(groupsTab);

      const input = await screen.findByLabelText('Risultato di Rossi / Bianchi – A2');
      fireEvent.change(input, { target: { value: '6-3 sei-tre' } });
      fireEvent.blur(input);

      expect(await screen.findByRole('alert')).toHaveTextContent('Non riesco a leggere "sei-tre"');
      expect(input).toHaveValue('');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('explains why the server refuses a result', async () => {
      stubApi({
        'GET /api/tournaments/t1': () => json(tournament),
        'PATCH /api/tournaments/t1/matches/p1-p2': () =>
          json(
            {
              error: 'Invalid change',
              issues: [{ code: 'SCORE_SET_INVALID', params: { set: 2, games: 6 } }],
            },
            400,
          ),
      });
      renderPage(groupsTab);

      const input = await screen.findByLabelText('Risultato di Rossi / Bianchi – A2');
      fireEvent.change(input, { target: { value: '6-3 6-5' } });
      fireEvent.blur(input);

      expect(
        await screen.findByText('Il set 2 non è un punteggio valido per un set a 6 game.'),
      ).toBeInTheDocument();
    });

    it('saves court and time from the dropdowns', async () => {
      const fetchMock = stubApi({
        'GET /api/tournaments/t1': () => json(tournament),
        'PATCH /api/tournaments/t1/matches/p1-p2': () => json(tournament),
      });
      renderPage(groupsTab);

      fireEvent.change(await screen.findByLabelText('Campo di Rossi / Bianchi – A2'), {
        target: { value: 'c2' },
      });

      await waitFor(() =>
        expect(sent(fetchMock, 'PATCH', '/api/tournaments/t1/matches/p1-p2')).toEqual({
          courtId: 'c2',
        }),
      );
    });

    it('moves a pair to another group before the first result', async () => {
      const fetchMock = stubApi({
        'GET /api/tournaments/t1': () => json(tournament),
        'PUT /api/tournaments/t1/groups': () => json(tournament),
      });
      renderPage(groupsTab);

      fireEvent.change(await screen.findByLabelText('Girone di A2'), { target: { value: 'B' } });

      await waitFor(() =>
        expect(sent(fetchMock, 'PUT', '/api/tournaments/t1/groups')).toEqual({
          groups: [
            { id: 'A', pairIds: ['p1'] },
            { id: 'B', pairIds: ['p3', 'p4', 'p2'] },
          ],
        }),
      );
    });

    it('explains a refused change and shows the saved data again', async () => {
      stubApi({
        'GET /api/tournaments/t1': () => json(tournament),
        'PUT /api/tournaments/t1/groups': () =>
          json(
            { error: 'Invalid change', issues: [{ code: 'GROUP_TOO_SMALL', params: { min: 2 } }] },
            400,
          ),
      });
      renderPage(groupsTab);

      fireEvent.change(await screen.findByLabelText('Girone di A2'), { target: { value: 'B' } });

      expect(
        await screen.findByText('Ogni girone deve avere almeno 2 iscritti.'),
      ).toBeInTheDocument();
    });

    it('draws the groups after confirmation', async () => {
      const fetchMock = stubApi({
        'GET /api/tournaments/t1': () => json(tournament),
        'POST /api/tournaments/t1/draw': () => json(tournament),
      });
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      renderPage(groupsTab);

      fireEvent.click(await screen.findByRole('button', { name: 'Sorteggio casuale' }));

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith('/api/tournaments/t1/draw', expect.anything()),
      );
    });

    it('locks groups and draw once a result is entered', async () => {
      stubApi({ 'GET /api/tournaments/t1': () => json(afterScore) });
      renderPage(groupsTab);

      expect(
        await screen.findByText('Ci sono già risultati: i gironi non si possono più modificare.'),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Sorteggio casuale' })).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Girone di A2')).not.toBeInTheDocument();
    });

    it('reloads the tournament if it was changed elsewhere', async () => {
      const fetchMock = stubApi({
        'GET /api/tournaments/t1': () => json(tournament),
        'PATCH /api/tournaments/t1/matches/p1-p2': () => json({ error: 'Changed' }, 409),
      });
      renderPage(groupsTab);

      const input = await screen.findByLabelText('Risultato di Rossi / Bianchi – A2');
      fireEvent.change(input, { target: { value: '6-1 6-1' } });
      fireEvent.blur(input);

      expect(
        await screen.findByText(
          'Il torneo è stato modificato altrove: ricaricato con i dati aggiornati.',
        ),
      ).toBeInTheDocument();
      await waitFor(() => expect(input).toHaveValue(''));
      expect(fetchMock.mock.calls.filter(([url]) => url === '/api/tournaments/t1')).toHaveLength(2);
    });
  });
});
