import { act, fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Tournament } from '../lib/tournaments';
import { renderIn } from '../test/render';
import { json, listItem, stubApi, tournament } from '../test/tournament-fixtures';
import { activeSlides } from '../lib/live';
import { GeneralLivePage, ROTATE_MS } from './GeneralLivePage';

/** In the knockout: bracket A still open, bracket B already has a champion. */
const knockout: Tournament = {
  ...tournament,
  id: 't2',
  name: 'Open d’autunno',
  summary: { status: 'knockout', matchesDone: 20, matchesTotal: 22 },
  brackets: [
    { id: 'A', size: 2, champion: null },
    { id: 'B', size: 2, champion: 'p3' },
  ],
  matches: [],
};
const draft: Tournament = {
  ...tournament,
  id: 't3',
  name: 'Bozza',
  summary: { status: 'draft', matchesDone: 0, matchesTotal: 22 },
};

describe('activeSlides', () => {
  it('takes the groups under way and the brackets without a champion', () => {
    const slides = activeSlides([tournament, knockout, draft]);
    expect(slides.map((s) => [s.tournament.id, s.bracket])).toEqual([
      ['t1', null],
      ['t2', 'A'],
    ]);
  });
});

describe('GeneralLivePage', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function renderPage() {
    renderIn(
      'it',
      <MemoryRouter>
        <GeneralLivePage />
      </MemoryRouter>,
    );
  }

  it('moves through every phase under way by itself, and by hand', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const item = (t: Tournament) => ({ ...listItem, id: t.id, name: t.name, summary: t.summary });
    const fetchMock = stubApi({
      'GET /api/tournaments': () => json([item(tournament), item(knockout), item(draft)]),
      'GET /api/tournaments/t1': () => json(tournament),
      'GET /api/tournaments/t2': () => json(knockout),
    });
    renderPage();

    expect(await screen.findByLabelText('Girone A')).toBeInTheDocument();
    expect(screen.getByText('1 di 2')).toBeInTheDocument();
    // A draft is not under way: never loaded
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/tournaments/t3')).toBe(false);

    await act(() => vi.advanceTimersByTimeAsync(ROTATE_MS));
    expect(screen.getByText('2 di 2')).toBeInTheDocument();
    expect(screen.getByText('Open d’autunno')).toBeInTheDocument();
    expect(screen.queryByLabelText('Girone A')).not.toBeInTheDocument();

    // Paused, it stays; the arrows still move
    fireEvent.click(screen.getByRole('button', { name: 'Pausa' }));
    await act(() => vi.advanceTimersByTimeAsync(ROTATE_MS * 2));
    expect(screen.getByText('2 di 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Successivo' }));
    expect(screen.getByText('1 di 2')).toBeInTheDocument();
  });

  it('says when no tournament is under way', async () => {
    stubApi({ 'GET /api/tournaments': () => json([{ ...listItem, summary: draft.summary }]) });
    renderPage();

    expect(await screen.findByText(/Nessun torneo in corso/)).toBeInTheDocument();
  });
});
