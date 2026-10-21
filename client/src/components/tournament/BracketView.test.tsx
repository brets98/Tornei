import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Match, Tournament } from '../../lib/tournaments';
import { renderIn } from '../../test/render';
import { mockActions, tournament as base } from '../../test/tournament-fixtures';
import { BracketView } from './BracketView';

const knockoutMatch = (round: number, index: number, changes: Partial<Match>): Match => ({
  id: `A${round}-${index}`,
  phase: 'knockout',
  bracket: 'A',
  round,
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

function renderBracket(tournament: Tournament, language: 'it' | 'en' = 'it', bracketIndex = 0) {
  const actions = mockActions();
  renderIn(
    language,
    <BracketView
      tournament={tournament}
      bracket={tournament.brackets[bracketIndex]}
      actions={actions}
    />,
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
    expect(screen.getByText('Vincitore Tabellone A')).toBeInTheDocument();
  });

  it('saves a result when both sides are known', () => {
    const actions = renderBracket(knockout());

    const semifinal = screen.getByLabelText('Semifinale 2');
    const input = within(semifinal).getByLabelText('Risultato di Semifinale 2');
    fireEvent.change(input, { target: { value: '6-2 6-3' } });
    fireEvent.blur(input);

    expect(actions.updateMatch).toHaveBeenCalledWith('A0-1', {
      sets: [
        { a: 6, b: 2 },
        { a: 6, b: 3 },
      ],
    });
  });

  it('saves court and time of a match', () => {
    const actions = renderBracket(knockout());

    fireEvent.change(screen.getByLabelText('Campo di Semifinale 2'), { target: { value: 'c1' } });

    expect(actions.updateMatch).toHaveBeenCalledWith('A0-1', { courtId: 'c1' });
  });

  it('shows the games of each set, with the tie-break points, and crowns the champion', () => {
    const [bye, semifinal, final] = knockout().matches;
    renderBracket(
      knockout({
        champion: 'p1',
        matches: [
          bye,
          {
            ...semifinal,
            sets: [
              { a: 6, b: 1 },
              { a: 6, b: 2 },
            ],
            state: 'done',
            winner: 'p2',
          },
          {
            ...final,
            pairB: 'p2',
            sets: [
              { a: 6, b: 2 },
              { a: 7, b: 6, tiebreak: { a: 7, b: 5 } },
            ],
            state: 'done',
            winner: 'p1',
          },
        ],
      }),
    );

    expect(screen.getByText('VINCITORE').parentElement).toHaveTextContent('Rossi / Bianchi');
    const finalCard = screen.getByLabelText('Finale');
    const [winnerRow, loserRow] = finalCard.querySelectorAll<HTMLElement>('.bm-row');
    expect(winnerRow).toHaveClass('win');
    expect(winnerRow).toHaveTextContent('67');
    // 7-6(5): the tie-break points go on the side that lost the set
    expect(loserRow).toHaveTextContent('265');
    expect(within(loserRow).getByText('5').tagName).toBe('SUP');
    expect(within(finalCard).getByLabelText('Risultato di Finale')).toHaveValue('6-2 7-6(5)');
  });

  it('flags a result that no longer counts, and clears it', () => {
    const [bye, semifinal, final] = knockout().matches;
    const actions = renderBracket(
      knockout({
        matches: [
          bye,
          semifinal,
          {
            ...final,
            sets: [
              { a: 6, b: 0 },
              { a: 6, b: 0 },
            ],
            state: 'stale',
          },
        ],
      }),
    );

    const finalCard = screen.getByLabelText('Finale');
    expect(within(finalCard).getByRole('alert')).toHaveTextContent(
      'sono cambiate le coppie di questa partita',
    );
    fireEvent.click(within(finalCard).getByRole('button', { name: 'Cancella punteggio' }));

    expect(actions.updateMatch).toHaveBeenCalledWith('A1-0', { sets: [] });
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

  it('shows where consolation entrants come from', () => {
    const main = knockout();
    const consolation: Tournament = {
      ...main,
      structure: { ...main.structure, type: 'knockout_consolation' },
      brackets: [...main.brackets, { id: 'C', size: 2, champion: null }],
      matches: [
        ...main.matches,
        knockoutMatch(0, 0, {
          id: 'C0-0',
          bracket: 'C',
          sourceA: { kind: 'firstLoser', matchId: 'A0-0' },
          sourceB: { kind: 'firstLoser', matchId: 'A0-1' },
        }),
      ],
    };
    renderBracket(consolation, 'en', 1);

    expect(screen.getByRole('heading', { name: 'Consolation' })).toBeInTheDocument();
    expect(screen.getByText(/Everyone who loses their first match plays here/)).toBeInTheDocument();
    // p1 had a bye: it comes only if it loses its first match, the final
    expect(screen.getByText('Rossi / Bianchi, if they lose Final')).toBeInTheDocument();
    expect(screen.getByText('Loser SF 2')).toBeInTheDocument();
    expect(screen.getByText('Consolation winner')).toBeInTheDocument();
  });

  it('empties the bracket after confirmation, with the consolation it fills', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const main = knockout();
    const played: Tournament = {
      ...main,
      brackets: [...main.brackets, { id: 'C', size: 2, champion: null }],
      matches: main.matches.map((m) =>
        m.id === 'A0-1'
          ? {
              ...m,
              sets: [
                { a: 6, b: 1 },
                { a: 6, b: 1 },
              ],
              state: 'done',
            }
          : m,
      ),
    };
    const actions = renderBracket(played);

    fireEvent.click(screen.getByRole('button', { name: 'Svuota tabellone' }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('consolazione compresa'));
    expect(actions.resetBracket).toHaveBeenCalledWith('A');
    confirm.mockRestore();
  });

  it('offers no emptying without results', () => {
    renderBracket(knockout());
    expect(screen.queryByRole('button', { name: 'Svuota tabellone' })).not.toBeInTheDocument();
  });
});
