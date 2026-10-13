import { fill, useI18n } from '../../i18n/context';
import { pairLabel, type Match, type Tournament } from '../../lib/tournaments';
import { CommitInput } from './CommitInput';

export type MatchChanges = Partial<Pick<Match, 'scoreA' | 'scoreB' | 'courtId' | 'timeSlotId'>>;

interface Props {
  tournament: Tournament;
  match: Match;
  onChange: (changes: MatchChanges) => void;
}

/** '' → null (no score); a whole number → that number; anything else → undefined (ignored). */
function parseScore(text: string): number | null | undefined {
  const value = text.trim();
  if (value === '') return null;
  return /^\d{1,2}$/.test(value) ? Number(value) : undefined;
}

/** One match: who plays, the two scores, court, time and state. */
export function MatchRow({ tournament, match, onChange }: Props) {
  const { t } = useI18n();
  const nameA = match.pairA ? pairLabel(tournament, match.pairA) : '—';
  const nameB = match.pairB ? pairLabel(tournament, match.pairB) : '—';
  const label = `${nameA} – ${nameB}`;

  const score = (side: 'scoreA' | 'scoreB', name: string) => (
    <CommitInput
      className="score"
      inputMode="numeric"
      aria-label={fill(t.groups.scoreOf, { pair: name })}
      value={match[side] === null ? '' : String(match[side])}
      onCommit={(text) => {
        const value = parseScore(text);
        if (value !== undefined) onChange({ [side]: value });
      }}
    />
  );

  return (
    <tr className={`match state-${match.state}`}>
      <td>
        <span className={match.winner === match.pairA ? 'match-winner' : undefined}>{nameA}</span>
        <span className="versus"> vs </span>
        <span className={match.winner === match.pairB ? 'match-winner' : undefined}>{nameB}</span>
      </td>
      <td className="scores">
        {score('scoreA', nameA)}
        <span className="versus">–</span>
        {score('scoreB', nameB)}
      </td>
      <td>
        <select
          className="mini-select"
          aria-label={fill(t.groups.courtOf, { match: label })}
          value={match.courtId ?? ''}
          onChange={(e) => onChange({ courtId: e.target.value || null })}
        >
          <option value="">—</option>
          {tournament.courts.map((court) => (
            <option key={court.id} value={court.id}>
              {court.name}
            </option>
          ))}
        </select>
      </td>
      <td>
        <select
          className="mini-select"
          aria-label={fill(t.groups.timeOf, { match: label })}
          value={match.timeSlotId ?? ''}
          onChange={(e) => onChange({ timeSlotId: e.target.value || null })}
        >
          <option value="">—</option>
          {tournament.timeSlots.map((slot) => (
            <option key={slot.id} value={slot.id}>
              {slot.time}
            </option>
          ))}
        </select>
      </td>
      <td>
        <span className={`match-state ${match.state}`}>{t.matchState[match.state]}</span>
      </td>
    </tr>
  );
}
