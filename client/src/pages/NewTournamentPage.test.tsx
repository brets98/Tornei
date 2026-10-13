import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Issue } from '../lib/tournaments';
import { json, stubApi } from '../test/tournament-fixtures';
import { NewTournamentPage } from './NewTournamentPage';

const preview = {
  groupSizes: [3, 3, 3, 3],
  brackets: [
    { id: 'A', entrants: 8, size: 8, byes: 0 },
    { id: 'B', entrants: 4, size: 4, byes: 0 },
  ],
  matchesTotal: 22,
};

/** The preview answers like the server would for the checks these tests need. */
function previewFor(body: { name: string; structure: { groupCount: number | null } }) {
  const issues: Issue[] = [];
  if (!body.name.trim()) issues.push({ code: 'NAME_REQUIRED' });
  if (body.structure.groupCount === 7) {
    issues.push({ code: 'GROUP_COUNT_RANGE', params: { pairs: 12, max: 6 } });
  }
  return json({ issues, preview: issues.length ? null : preview });
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/tournaments/new']}>
      <Routes>
        <Route path="tournaments/new" element={<NewTournamentPage />} />
        <Route path="tournaments/:id" element={<p>Pagina del torneo</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
/** Lets the debounced preview request run and answer. */
const previewChecked = () => new Promise((resolve) => setTimeout(resolve, 300));
const next = () => fireEvent.click(screen.getByRole('button', { name: 'Avanti' }));

describe('NewTournamentPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks for a name before going on', async () => {
    stubApi({ 'POST /api/tournaments/preview': previewFor as never });
    renderPage();

    await previewChecked();
    next();

    expect(await screen.findByText('Inserisci il nome del torneo.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome')).toBeInTheDocument();
  });

  it('only allows doubles for padel', () => {
    stubApi({ 'POST /api/tournaments/preview': previewFor as never });
    renderPage();

    expect(screen.getByLabelText('Singolo')).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Tennis'));
    expect(screen.getByLabelText('Singolo')).toBeEnabled();
  });

  it('shows the group sizes and explains an impossible structure', async () => {
    stubApi({ 'POST /api/tournaments/preview': previewFor as never });
    renderPage();
    type('Nome', 'Torneo di primavera');
    await previewChecked();
    next();

    expect(await screen.findByText('Girone A: 3 coppie')).toBeInTheDocument();
    expect(
      screen.getByText('Tabellone A: 8 coppie, si parte da quarti di finale'),
    ).toBeInTheDocument();

    type('Numero di gironi', '7');
    expect(
      await screen.findByText(
        'Con 12 iscritti puoi fare da 1 a 6 gironi: ogni girone deve averne almeno 2.',
      ),
    ).toBeInTheDocument();
  });

  it('creates the tournament and opens it', async () => {
    const fetchMock = stubApi({
      'POST /api/tournaments/preview': previewFor as never,
      'POST /api/tournaments': () => json({ id: 't1' }, 201),
    });
    renderPage();
    type('Nome', 'Torneo di primavera');
    await previewChecked();
    next();
    await screen.findByText('Girone A: 3 coppie');
    next();
    type('Nome campo 1', 'Bigi');
    next();
    fireEvent.click(screen.getByRole('button', { name: 'Crea torneo' }));

    expect(await screen.findByText('Pagina del torneo')).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls.filter(([url]) => url === '/api/tournaments').at(-1)!;
    expect(JSON.parse(init!.body as string)).toMatchObject({
      name: 'Torneo di primavera',
      sport: 'padel',
      format: 'doubles',
      pairCount: 12,
      courts: ['Bigi', 'Campo 2', 'Campo 3', 'Campo 4'],
      timeSlots: ['19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00', '22:30', '23:00'],
      structure: { type: 'groups_knockout', groupCount: 4, advanceA: 2, advanceB: 1 },
    });
  });

  it('generates and edits the time slots', async () => {
    stubApi({ 'POST /api/tournaments/preview': previewFor as never });
    renderPage();
    type('Nome', 'Torneo');
    await previewChecked();
    next();
    await screen.findByText('Girone A: 3 coppie');
    next();

    type('Dalle', '18:00');
    type('Alle', '19:00');
    fireEvent.click(screen.getByRole('button', { name: 'Genera orari' }));
    expect(screen.getByText('18:30')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Rimuovi 18:30' }));
    expect(screen.queryByText('18:30')).not.toBeInTheDocument();
    expect(screen.getByText('19:00')).toBeInTheDocument();
  });
});
