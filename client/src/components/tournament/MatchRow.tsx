import { fill, useI18n } from '../../i18n/context';
import { pairLabel, type Match, type Tournament } from '../../lib/tournaments';
import { CourtSelect, ScoreInput, TimeSelect } from './MatchFields';

export type MatchChanges = Partial<Pick<Match, 'scoreA' | 'scoreB' | 'courtId' | 'timeSlotId'>>;

interface Props {
  tournament: Tournament;
  match: Match;
  onChange: (changes: MatchChanges) => void;
}

/** One group match: who plays, the two scores, court, time and state. */
export function MatchRow({ tournament, match, onChange }: Props) {
  const { t } = useI18n();
  const nameA = match.pairA ? pairLabel(tournament, match.pairA) : '—';
  const nameB = match.pairB ? pairLabel(tournament, match.pairB) : '—';
  const label = `${nameA} – ${nameB}`;

  return (
    <tr className={`match state-${match.state}`}>
      <td>
        <span className={match.winner === match.pairA ? 'match-winner' : undefined}>{nameA}</span>
        <span className="versus"> vs </span>
        <span className={match.winner === match.pairB ? 'match-winner' : undefined}>{nameB}</span>
      </td>
      <td className="scores">
        <ScoreInput
          value={match.scoreA}
          label={fill(t.groups.scoreOf, { pair: nameA })}
          onSave={(scoreA) => onChange({ scoreA })}
        />
        <span className="versus">–</span>
        <ScoreInput
          value={match.scoreB}
          label={fill(t.groups.scoreOf, { pair: nameB })}
          onSave={(scoreB) => onChange({ scoreB })}
        />
      </td>
      <td>
        <CourtSelect
          tournament={tournament}
          value={match.courtId}
          label={fill(t.groups.courtOf, { match: label })}
          onSave={(courtId) => onChange({ courtId })}
        />
      </td>
      <td>
        <TimeSelect
          tournament={tournament}
          value={match.timeSlotId}
          label={fill(t.groups.timeOf, { match: label })}
          onSave={(timeSlotId) => onChange({ timeSlotId })}
        />
      </td>
      <td>
        <span className={`match-state ${match.state}`}>{t.matchState[match.state]}</span>
      </td>
    </tr>
  );
}
