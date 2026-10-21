import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Tournament } from '../../lib/tournaments';
import { renderIn } from '../../test/render';
import { mockActions, tournament as base } from '../../test/tournament-fixtures';
import { EntriesView } from './EntriesView';

/** A consolation draw: p2 is the only level 1, so it is the first seed. */
const consolation: Tournament = {
  ...base,
  structure: { type: 'knockout_consolation', groupCount: 0, advanceA: 0, advanceB: 0 },
  groups: [],
  pairs: base.pairs.map((p) => ({ ...p, level: p.id === 'p2' ? 1 : 4 })),
  seeding: ['p2', 'p1', 'p3', 'p4'],
  matches: [],
};

function renderEntries(tournament: Tournament) {
  const actions = mockActions();
  renderIn('it', <EntriesView tournament={tournament} actions={actions} />);
  return actions;
}

describe('EntriesView', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('changes levels and redraws the consolation draw', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const actions = renderEntries(consolation);

    expect(screen.getByLabelText('Livello coppia 1')).toHaveValue('1');
    fireEvent.change(screen.getByLabelText('Livello coppia 2'), { target: { value: '2' } });
    expect(actions.setLevel).toHaveBeenCalledWith('p1', 2);

    fireEvent.click(screen.getByRole('button', { name: 'Rifai il sorteggio' }));
    expect(actions.draw).toHaveBeenCalled();
  });

  it('locks levels and draw once a result is entered', () => {
    renderEntries({
      ...consolation,
      matches: [{ ...base.matches[0], sets: [{ a: 6, b: 1 }] }],
    });

    expect(screen.getByLabelText('Livello coppia 1')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Rifai il sorteggio' })).not.toBeInTheDocument();
  });
});
