import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderIn } from '../test/render';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, listItem, stubApi } from '../test/tournament-fixtures';
import { TournamentsPage } from './TournamentsPage';

function renderPage() {
  renderIn(
    'it',
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route index element={<TournamentsPage />} />
        <Route path="tournaments/:id" element={<p>Pagina del torneo</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TournamentsPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('lists the tournaments with sport, date, status and progress', async () => {
    stubApi({ 'GET /api/tournaments': () => json([listItem]) });
    renderPage();

    const row = (await screen.findByRole('link', { name: 'Torneo di primavera' })).closest('tr')!;
    expect(within(row).getByText('Padel · Doppio')).toBeInTheDocument();
    expect(within(row).getByText('20/10/2026')).toBeInTheDocument();
    expect(within(row).getByText('Fase a gironi')).toBeInTheDocument();
    expect(within(row).getByText('3/22 partite')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nuovo torneo' })).toHaveAttribute(
      'href',
      '/tournaments/new',
    );
  });

  it('says when there are no tournaments yet', async () => {
    stubApi({ 'GET /api/tournaments': () => json([]) });
    renderPage();

    expect(await screen.findByText('Non hai ancora creato tornei.')).toBeInTheDocument();
  });

  it('deletes a tournament only after confirmation', async () => {
    const fetchMock = stubApi({
      'GET /api/tournaments': () => json([listItem]),
      'DELETE /api/tournaments/t1': () => json(null, 204),
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Elimina' }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Torneo di primavera'));
    expect(fetchMock).not.toHaveBeenCalledWith('/api/tournaments/t1', expect.anything());

    confirm.mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole('button', { name: 'Elimina' }));

    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Torneo di primavera' })).not.toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledWith('/api/tournaments/t1', { method: 'DELETE' });
  });

  it('opens the copy after duplicating', async () => {
    stubApi({
      'GET /api/tournaments': () => json([listItem]),
      'POST /api/tournaments/t1/duplicate': () => json({ ...listItem, id: 't2' }, 201),
    });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Duplica' }));

    expect(await screen.findByText('Pagina del torneo')).toBeInTheDocument();
  });
});
