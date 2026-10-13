import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Match, Tournament } from '../../lib/tournaments';
import { renderIn } from '../../test/render';
import { tournament as base } from '../../test/tournament-fixtures';
import type { TournamentActions } from './actions';
import { BracketView } from './BracketView';

const knockoutMatch = (round: number, index: number, changes: Partial<Match>): Match => ({
  id: `A${round}-${index}`,
  phase: 'knockout',
  bracket: 'A',
  round,
  index,
  pairA: null,
  pairB: null,
  scoreA: null,
  scoreB: null,
  courtId: null,
  timeSlotId: null,
  state: 'todo',
  winner: null,
  ...changes,
});

/** 3 entries in a bracket of 4: p1 has a bye, p2 plays p3, the final waits for both. */
function knockout(changes: { matches?: Match[]; champion?: string | null } = {}): Tournament {
  return {
    ...base,
    structure: { type: 'knockout', groupCount: 0, advanceA: 0, advanceB: 0 },
    groups: [],
    seeding: ['p1', 'p2', 'p3'],
    brackets: [{ id: 'A', size: 4, champion: changes.champion ?? null }],
    matches: changes.matches ?? [
      knockoutMatch(0, 0, {
        sourceA: { kind: 'seed', index: 0 },
        sourceB: { kind: 'bye' },
        pairA: 'p1',
        state: 'bye',
        winner: 'p1',
      }),
      knockoutMatch(0, 1, {
        sourceA: { kind: 'seed', index: 1 },
        sourceB: { kind: 'seed', index: 2 },
        pairA: 'p2',
        pairB: 'p3',
      }),
      knockoutMatch(1, 0, {
        sourceA: { kind: 'winner', matchId: 'A0-0' },
        sourceB: { kind: 'winner', matchId: 'A0-1' },
        pairA: 'p1',
      }),
    ],
  };
}

function renderBracket(tournament: Tournament, language: 'it' | 'en' = 'it') {
  const actions: TournamentActions = {
    setPlayers: vi.fn(),
    updateMatch: vi.fn(),
    setGroups: vi.fn(),
    draw: vi.fn(),
  };
  renderIn(
    language,
    <BracketView tournament={tournament} bracket={tournament.brackets[0]} actions={actions} />,
  );
  return actions;
}

describe('BracketView', () => {
  it('shows the rounds, byes, placeholders and the champion to come', () => {
    renderBracket(knockout());

    expect(screen.getByText('Semifinali')).toBeInTheDocument();
    expect(screen.getByText('Finale')).toBeInTheDocument();
    expect(screen.getByText('Riposo')).toBeInTheDocument();
    // The final: p1 is known, the other side waits for the second semifinal
    const final = screen.getByLabelText('Finale');
    expect(within(final).getByText('Rossi / Bianchi')).toBeInTheDocument();
    expect(within(final).getByText('Vincitore Semifinale 2')).toBeInTheDocument();
    expect(
      within(final)
        .getAllByRole('textbox')
        .every((input) => input.hasAttribute('disabled')),
    ).toBe(true);
    expect(screen.getByText('Vincitore tabellone A')).toBeInTheDocument();
  });

  it('saves a score when both sides are known', () => {
    const actions = renderBracket(knockout());

    const semifinal = screen.getByLabelText('Semifinale 2');
    const [scoreA] = within(semifinal).getAllByRole('textbox');
    fireEvent.change(scoreA, { target: { value: '2' } });
    fireEvent.blur(scoreA);

    expect(actions.updateMatch).toHaveBeenCalledWith('A0-1', { scoreA: 2 });
  });

  it('saves court and time of a match', () => {
    const actions = renderBracket(knockout());

    fireEvent.change(screen.getByLabelText('Campo di Semifinale 2'), { target: { value: 'c1' } });

    expect(actions.updateMatch).toHaveBeenCalledWith('A0-1', { courtId: 'c1' });
  });

  it('crowns the champion', () => {
    const [bye, semifinal, final] = knockout().matches;
    renderBracket(
      knockout({
        champion: 'p1',
        matches: [
          bye,
          { ...semifinal, scoreA: 2, scoreB: 0, state: 'done', winner: 'p2' },
          { ...final, pairB: 'p2', scoreA: 2, scoreB: 1, state: 'done', winner: 'p1' },
        ],
      }),
    );

    expect(screen.getByText('VINCITORE').parentElement).toHaveTextContent('Rossi / Bianchi');
  });

  it('flags a result that no longer counts, and clears it', () => {
    const [bye, semifinal, final] = knockout().matches;
    const actions = renderBracket(
      knockout({
        matches: [bye, semifinal, { ...final, scoreA: 2, scoreB: 0, state: 'stale' }],
      }),
    );

    const finalCard = screen.getByLabelText('Finale');
    expect(within(finalCard).getByRole('alert')).toHaveTextContent(
      'sono cambiate le coppie di questa partita',
    );
    fireEvent.click(within(finalCard).getByRole('button', { name: 'Cancella punteggio' }));

    expect(actions.updateMatch).toHaveBeenCalledWith('A1-0', { scoreA: null, scoreB: null });
  });

  it('shows group positions before the groups are complete', () => {
    const fromGroups: Tournament = {
      ...base,
      brackets: [{ id: 'A', size: 2, champion: null }],
      matches: [
        ...base.matches,
        knockoutMatch(0, 0, {
          sourceA: { kind: 'group', groupId: 'A', position: 1 },
          sourceB: { kind: 'group', groupId: 'B', position: 1 },
        }),
      ],
    };
    renderBracket(fromGroups, 'en');

    expect(screen.getByText('Group A #1')).toBeInTheDocument();
    expect(screen.getByText('Group B #1')).toBeInTheDocument();
    expect(screen.getByText(/Filled from the group standings/)).toBeInTheDocument();
  });
});
