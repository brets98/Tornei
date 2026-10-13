import {
  exampleResult,
  formatResult,
  parseResult,
  type MatchFormat,
  type SetScore,
} from '../../lib/score';
import type { Tournament } from '../../lib/tournaments';
import { CommitInput } from './CommitInput';

/**
 * The whole result of a match as text ('6-3 4-6 7-6(5)'), saved when left. Text that can't be
 * read is reported through `onUnreadable` and not saved.
 */
export function ResultInput({
  value,
  format,
  label,
  disabled,
  onSave,
  onUnreadable,
}: {
  value: SetScore[];
  format: MatchFormat;
  label: string;
  disabled?: boolean;
  onSave: (sets: SetScore[]) => void;
  onUnreadable: (text: string) => void;
}) {
  return (
    <CommitInput
      className="result-input"
      aria-label={label}
      placeholder={exampleResult(format)}
      disabled={disabled}
      value={formatResult(value)}
      onCommit={(text) => {
        const result = parseResult(text, format);
        if ('sets' in result) onSave(result.sets);
        else onUnreadable(result.unreadable);
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
