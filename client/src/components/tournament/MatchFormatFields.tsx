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
  name = 'match',
  title,
  onChange,
}: {
  sport: Sport;
  sets: SetsChoice;
  decider: Decider;
  disabled?: boolean;
  /** Tells apart the radio buttons when there is more than one format on the page */
  name?: string;
  /** Shown above the fields */
  title?: string;
  onChange: (changes: { sets?: SetsChoice; decider?: Decider }) => void;
}) {
  const { t } = useI18n();
  const format = buildMatchFormat(sets, decider);
  return (
    <>
      {title && <h4>{title}</h4>}
      <div className="choice column">
        <span>{t.matchFormats.sets}</span>
        {SETS_CHOICES.filter((choice) => sport === 'tennis' || choice !== 'bestOf5').map(
          (choice) => (
            <label key={choice} className="checkbox">
              <input
                type="radio"
                name={`${name}-sets`}
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
                name={`${name}-decider`}
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

/** A group phase format apart from the knockout one: whether there is one, and which. */
export interface GroupFormatChoice {
  groupFormat: boolean;
  groupSets: SetsChoice;
  groupDecider: Decider;
}

/**
 * The match format, and optionally another one for the group phase (groups + knockout only,
 * e.g. a pro set to 9 in the groups and best of 3 sets in the knockout).
 */
export function MatchFormatsFields({
  sport,
  sets,
  decider,
  withGroups,
  group,
  disabled,
  onChange,
}: {
  sport: Sport;
  sets: SetsChoice;
  decider: Decider;
  /** Groups + knockout: the group phase can have its own format */
  withGroups: boolean;
  group: GroupFormatChoice;
  disabled?: boolean;
  onChange: (
    changes: Partial<GroupFormatChoice> & { sets?: SetsChoice; decider?: Decider },
  ) => void;
}) {
  const { t } = useI18n();
  const separate = withGroups && group.groupFormat;
  return (
    <>
      {withGroups && (
        <label className="checkbox">
          <input
            type="checkbox"
            checked={group.groupFormat}
            disabled={disabled}
            onChange={(e) => onChange({ groupFormat: e.target.checked })}
          />
          {t.matchFormats.separateGroups}
        </label>
      )}
      {separate && (
        <MatchFormatFields
          sport={sport}
          sets={group.groupSets}
          decider={group.groupDecider}
          disabled={disabled}
          name="group"
          title={t.matchFormats.groupMatches}
          onChange={(changes) =>
            onChange({
              ...(changes.sets && { groupSets: changes.sets }),
              ...(changes.decider && { groupDecider: changes.decider }),
            })
          }
        />
      )}
      <MatchFormatFields
        sport={sport}
        sets={sets}
        decider={decider}
        disabled={disabled}
        title={separate ? t.matchFormats.knockoutMatches : undefined}
        onChange={onChange}
      />
    </>
  );
}
