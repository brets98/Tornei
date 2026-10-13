import { parseScore, type Tournament } from '../../lib/tournaments';
import { CommitInput } from './CommitInput';

/** One side's score; saved when left. Text that isn't a score is ignored. */
export function ScoreInput({
  value,
  label,
  disabled,
  onSave,
}: {
  value: number | null;
  label: string;
  disabled?: boolean;
  onSave: (score: number | null) => void;
}) {
  return (
    <CommitInput
      className="score"
      inputMode="numeric"
      aria-label={label}
      disabled={disabled}
      value={value === null ? '' : String(value)}
      onCommit={(text) => {
        const score = parseScore(text);
        if (score !== undefined) onSave(score);
      }}
    />
  );
}

interface SelectProps {
  tournament: Tournament;
  value: string | null;
  label: string;
  onSave: (id: string | null) => void;
}

export function CourtSelect({ tournament, value, label, onSave }: SelectProps) {
  return (
    <select
      className="mini-select"
      aria-label={label}
      value={value ?? ''}
      onChange={(e) => onSave(e.target.value || null)}
    >
      <option value="">—</option>
      {tournament.courts.map((court) => (
        <option key={court.id} value={court.id}>
          {court.name}
        </option>
      ))}
    </select>
  );
}

export function TimeSelect({ tournament, value, label, onSave }: SelectProps) {
  return (
    <select
      className="mini-select"
      aria-label={label}
      value={value ?? ''}
      onChange={(e) => onSave(e.target.value || null)}
    >
      <option value="">—</option>
      {tournament.timeSlots.map((slot) => (
        <option key={slot.id} value={slot.id}>
          {slot.time}
        </option>
      ))}
    </select>
  );
}
