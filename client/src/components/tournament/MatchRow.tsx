import { fill, useI18n } from '../../i18n/context';
import { exampleResult } from '../../lib/score';
import { pairLabel, type Match, type Tournament } from '../../lib/tournaments';
import type { TournamentActions } from './actions';
import { CourtSelect, ResultInput, TimeSelect } from './MatchFields';

export type MatchChanges = Partial<Pick<Match, 'sets' | 'courtId' | 'timeSlotId'>>;

interface Props {
  tournament: Tournament;
  match: Match;
  actions: TournamentActions;
}

/** One group match: who plays, the result set by set, court, time and state. */
export function MatchRow({ tournament, match, actions }: Props) {
  const { t } = useI18n();
  const nameA = match.pairA ? pairLabel(tournament, match.pairA) : '—';
  const nameB = match.pairB ? pairLabel(tournament, match.pairB) : '—';
  const label = `${nameA} – ${nameB}`;
  const save = (changes: MatchChanges) => actions.updateMatch(match.id, changes);

  return (
    <tr className={`match state-${match.state}`}>
      <td>
        <span className={match.winner === match.pairA ? 'match-winner' : undefined}>{nameA}</span>
        <span className="versus"> vs </span>
        <span className={match.winner === match.pairB ? 'match-winner' : undefined}>{nameB}</span>
      </td>
      <td>
        <ResultInput
          value={match.sets}
          label={fill(t.groups.resultOf, { match: label })}
          placeholder={exampleResult(tournament.matchFormat)}
          onSave={(sets) => save({ sets })}
          onUnreadable={actions.reportUnreadable}
        />
      </td>
      <td>
        <CourtSelect
          tournament={tournament}
          value={match.courtId}
          label={fill(t.groups.courtOf, { match: label })}
          onSave={(courtId) => save({ courtId })}
        />
      </td>
      <td>
        <TimeSelect
          tournament={tournament}
          value={match.timeSlotId}
          label={fill(t.groups.timeOf, { match: label })}
          onSave={(timeSlotId) => save({ timeSlotId })}
        />
      </td>
      <td>
        <span className={`match-state ${match.state}`}>{t.matchState[match.state]}</span>
      </td>
    </tr>
  );
}
