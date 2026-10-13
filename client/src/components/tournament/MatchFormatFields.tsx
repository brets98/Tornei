import { fill, useI18n } from '../../i18n/context';
import {
  buildMatchFormat,
  DECIDERS,
  decidingSet,
  exampleResult,
  SETS_CHOICES,
  type Decider,
  type SetsChoice,
} from '../../lib/score';
import type { Sport } from '../../lib/tournaments';

/** How many sets, and how the deciding one is played (wizard and settings). */
export function MatchFormatFields({
  sport,
  sets,
  decider,
  disabled,
  onChange,
}: {
  sport: Sport;
  sets: SetsChoice;
  decider: Decider;
  disabled?: boolean;
  onChange: (changes: { sets?: SetsChoice; decider?: Decider }) => void;
}) {
  const { t } = useI18n();
  const format = buildMatchFormat(sets, decider);
  return (
    <>
      <div className="choice column">
        <span>{t.matchFormats.sets}</span>
        {SETS_CHOICES.filter((choice) => sport === 'tennis' || choice !== 'bestOf5').map(
          (choice) => (
            <label key={choice} className="checkbox">
              <input
                type="radio"
                name="sets"
                checked={sets === choice}
                disabled={disabled}
                onChange={() => onChange({ sets: choice })}
              />
              {t.matchFormats[choice]}
            </label>
          ),
        )}
      </div>
      {format.bestOf > 1 && (
        <div className="choice column">
          <span>
            {fill(t.matchFormats.decider, { nth: t.matchFormats.nth[decidingSet(format)] })}
          </span>
          {DECIDERS.map((choice) => (
            <label key={choice} className="checkbox">
              <input
                type="radio"
                name="decider"
                checked={decider === choice}
                disabled={disabled}
                onChange={() => onChange({ decider: choice })}
              />
              {t.matchFormats.deciders[choice]}
            </label>
          ))}
        </div>
      )}
      <p className="muted">{fill(t.wizard.resultExample, { example: exampleResult(format) })}</p>
    </>
  );
}
