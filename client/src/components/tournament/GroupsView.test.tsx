import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Tournament } from '../../lib/tournaments';
import { renderIn } from '../../test/render';
import { mockActions, tournament } from '../../test/tournament-fixtures';
import { GroupsView } from './GroupsView';

function renderGroups(t: Tournament) {
  const actions = mockActions();
  renderIn('it', <GroupsView tournament={t} actions={actions} />);
  return actions;
}

describe('GroupsView: adding and removing entries', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds an entry to each group with its own button', () => {
    const actions = renderGroups(tournament);
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi coppia al girone B' }));
    expect(actions.addPair).toHaveBeenCalledWith('B');
    expect(screen.getAllByText('+ Aggiungi coppia')).toHaveLength(2);
  });

  it('removes an entry after confirmation, saying how many results go with it', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const scored: Tournament = {
      ...tournament,
      matches: tournament.matches.map((m) =>
        m.id === 'p1-p2'
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
    const actions = renderGroups(scored);

    fireEvent.click(screen.getByRole('button', { name: 'Togli Rossi / Bianchi' }));
    expect(confirm).toHaveBeenCalledWith(
      'Togliere Rossi / Bianchi dal torneo? Verranno cancellati anche i risultati delle sue partite nel girone (1).',
    );
    expect(actions.removePair).toHaveBeenCalledWith('p1');

    fireEvent.click(screen.getByRole('button', { name: 'Togli B1' }));
    expect(confirm).toHaveBeenLastCalledWith('Togliere B1 dal torneo?');
  });

  it('offers neither once the knockout has a result', () => {
    const started: Tournament = {
      ...tournament,
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
          sets: [{ a: 6, b: 1 }],
        },
      ],
    };
    renderGroups(started);
    expect(screen.queryByText('+ Aggiungi coppia')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Togli / })).not.toBeInTheDocument();
  });
});
