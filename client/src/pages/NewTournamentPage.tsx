import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { Messages } from '../i18n/en';
import { fill, useI18n } from '../i18n/context';
import { ApiError, apiPost } from '../lib/api';
import { PlayersDatalist } from '../components/PlayersDatalist';
import { StageLinkFields } from '../components/StageLinkFields';
import { MatchFormatFields } from '../components/tournament/MatchFormatFields';
import { PLAYERS_LIST_ID, type StageLink } from '../lib/circuits';
import { buildMatchFormat, type Decider, type SetsChoice } from '../lib/score';
import {
  entriesLabel,
  issueMessage,
  LEVELS,
  matchFormatName,
  roundName,
  type Format,
  type Issue,
  type Preview,
  type Sport,
  type StructureType,
  type Tournament,
} from '../lib/tournaments';

interface Form {
  name: string;
  subtitle: string;
  sport: Sport;
  format: Format;
  date: string;
  pairCount: string;
  /** Random draw + consolation: each entry's players (2 fields; singles uses the first) and level */
  entryRows: EntryRow[];
  structureType: StructureType;
  sets: SetsChoice;
  decider: Decider;
  groupCount: string;
  advanceA: string;
  withB: boolean;
  advanceB: string;
  courts: string[];
  timeSlots: string[];
  /** A stage of this circuit, or null */
  circuit: StageLink | null;
}

const STRUCTURE_TYPES: StructureType[] = [
  'groups_knockout',
  'knockout',
  'groups',
  'knockout_consolation',
];
/** Padel usually plays a super tie-break instead of the third set; tennis plays it out. */
const DEFAULT_MATCH_FORMAT: Record<Sport, Pick<Form, 'sets' | 'decider'>> = {
  padel: { sets: 'bestOf3', decider: 'superTiebreak' },
  tennis: { sets: 'bestOf3', decider: 'set' },
};
const SPORTS: Sport[] = ['padel', 'tennis'];
const FORMATS: Format[] = ['doubles', 'singles'];
const MAX_COURTS = 20;
/** Rows the entry list starts with: the fewest a consolation draw allows */
const INITIAL_ENTRY_ROWS = 4;

interface EntryRow {
  players: string[];
  level: number;
}

/** A new row starts at the weakest level: with every row equal the draw is fully random */
const emptyEntryRow = (): EntryRow => ({ players: ['', ''], level: LEVELS.at(-1)! });
const PREVIEW_DELAY_MS = 250;

/** Which wizard step each issue belongs to (unknown codes go to the summary). */
const STEP_OF_ISSUE: [RegExp, number][] = [
  [/^(NAME_|SPORT_|FORMAT_|PADEL_|DATE_|CIRCUIT_)/, 0],
  [/^(PAIR_|PLAYER|STRUCTURE_|GROUP_|ADVANCE_|BRACKET_|MATCH_FORMAT_)/, 1],
  [/^(COURT|SLOT)/, 2],
];
const LAST_STEP = 3;

function stepOf(issue: Issue) {
  return STEP_OF_ISSUE.find(([pattern]) => pattern.test(issue.code))?.[1] ?? LAST_STEP;
}

function today() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const minutes = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

/** '19:00'–'20:00' every 30 → ['19:00', '19:30', '20:00']. */
function generateSlots(from: string, to: string, every: number): string[] {
  if (!/^\d{2}:\d{2}$/.test(from) || !/^\d{2}:\d{2}$/.test(to) || !(every >= 5)) return [];
  const slots: string[] = [];
  for (let t = minutes(from); t <= minutes(to); t += every) {
    slots.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
  }
  return slots;
}

const defaultCourt = (t: Messages, n: number) => fill(t.wizard.defaultCourt, { n });

const initialForm = (t: Messages, circuitId: string | null): Form => ({
  name: '',
  subtitle: '',
  sport: 'padel',
  format: 'doubles',
  date: today(),
  pairCount: '12',
  entryRows: Array.from({ length: INITIAL_ENTRY_ROWS }, emptyEntryRow),
  structureType: 'groups_knockout',
  ...DEFAULT_MATCH_FORMAT.padel,
  groupCount: '4',
  advanceA: '2',
  withB: true,
  advanceB: '1',
  courts: [1, 2, 3, 4].map((n) => defaultCourt(t, n)),
  timeSlots: generateSlots('19:00', '23:00', 30),
  // 'New stage' from a circuit: its first category, chosen once the circuits are loaded
  circuit: circuitId ? { circuitId, categoryId: '' } : null,
});

/** What the API expects (see parseSetup on the server). Empty numbers become null: invalid. */
function toSetup(form: Form) {
  const number = (value: string) => (value.trim() === '' ? null : Number(value));
  const format = form.sport === 'padel' ? 'doubles' : form.format;
  const players =
    form.structureType === 'knockout_consolation'
      ? form.entryRows.map((row) => row.players.slice(0, format === 'singles' ? 1 : 2))
      : undefined;
  return {
    name: form.name,
    subtitle: form.subtitle,
    sport: form.sport,
    format,
    date: form.date,
    pairCount: players ? players.length : number(form.pairCount),
    ...(players && { players, levels: form.entryRows.map((row) => row.level) }),
    courts: form.courts,
    timeSlots: form.timeSlots,
    structure: {
      type: form.structureType,
      groupCount: number(form.groupCount),
      advanceA: number(form.advanceA),
      advanceB: form.withB ? number(form.advanceB) : 0,
    },
    matchFormat: buildMatchFormat(form.sets, form.decider),
    circuit: form.circuit,
  };
}

export function NewTournamentPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState<Form>(() => initialForm(t, searchParams.get('circuit')));
  const [step, setStep] = useState(0);
  const [tried, setTried] = useState(false);
  const [checked, setChecked] = useState<{ issues: Issue[]; preview: Preview | null } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const setup = useMemo(() => toSetup(form), [form]);
  const entries = entriesLabel(t, setup.format as Format);

  // Ask the server what this setup gives, a moment after the last change
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      apiPost<{ issues: Issue[]; preview: Preview | null }>('/tournaments/preview', setup)
        .then((result) => current && setChecked(result))
        .catch(() => current && setChecked(null));
    }, PREVIEW_DELAY_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [setup]);

  const update = (changes: Partial<Form>) => setForm((f) => ({ ...f, ...changes }));
  const stepIssues = (checked?.issues ?? []).filter((i) => stepOf(i) === step);
  // The first step's errors (e.g. empty name) only after trying to go on; later steps live
  const visibleIssues = step > 0 || tried ? stepIssues : [];

  function next() {
    if (stepIssues.length > 0) {
      setTried(true);
      return;
    }
    setTried(false);
    setStep((s) => s + 1);
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < LAST_STEP) {
      next();
      return;
    }
    setError('');
    setBusy(true);
    try {
      const tournament = await apiPost<Tournament>('/tournaments', setup);
      navigate(`/tournaments/${tournament.id}`);
    } catch (err) {
      const issues = err instanceof ApiError ? (err.body.issues as Issue[] | undefined) : undefined;
      if (issues?.length) {
        setChecked({ issues, preview: null });
        setStep(Math.min(...issues.map(stepOf)));
        setTried(true);
      } else {
        setError(t.wizard.createError);
      }
      setBusy(false);
    }
  }

  return (
    <article className="page wizard">
      <h1>{t.wizard.title}</h1>
      <ol className="steps">
        {t.wizard.steps.map((label, i) => (
          <li key={label} className={i === step ? 'active' : i < step ? 'done' : ''}>
            <span>{i + 1}</span> {label}
          </li>
        ))}
      </ol>

      <form onSubmit={create} noValidate>
        {step === 0 && <InfoStep form={form} update={update} />}
        {step === 1 && (
          <StructureStep
            form={form}
            update={update}
            entries={entries}
            preview={checked?.preview ?? null}
          />
        )}
        {step === 2 && <CourtsStep form={form} update={update} />}
        {step === 3 && (
          <SummaryStep form={form} entries={entries} preview={checked?.preview ?? null} />
        )}

        {visibleIssues.length > 0 && (
          <ul className="issues" role="alert">
            {visibleIssues.map((issue) => (
              <li key={issue.code + JSON.stringify(issue.params ?? {})}>
                {issueMessage(t, issue)}
              </li>
            ))}
          </ul>
        )}
        {error && <p className="error">{error}</p>}

        <div className="wizard-actions">
          {step > 0 && (
            <button type="button" className="secondary" onClick={() => setStep((s) => s - 1)}>
              {t.common.back}
            </button>
          )}
          <button type="submit" disabled={busy}>
            {step < LAST_STEP ? t.common.next : t.wizard.create}
          </button>
        </div>
      </form>
    </article>
  );
}

interface StepProps {
  form: Form;
  update: (changes: Partial<Form>) => void;
}

function InfoStep({ form, update }: StepProps) {
  const { t } = useI18n();
  return (
    <fieldset>
      <label>
        {t.wizard.name}
        <input value={form.name} onChange={(e) => update({ name: e.target.value })} autoFocus />
      </label>
      <label>
        {t.wizard.subtitle}
        <input value={form.subtitle} onChange={(e) => update({ subtitle: e.target.value })} />
      </label>
      <div className="choice">
        <span>{t.wizard.sport}</span>
        {SPORTS.map((sport) => (
          <label key={sport} className="checkbox">
            <input
              type="radio"
              name="sport"
              checked={form.sport === sport}
              onChange={() =>
                update({
                  sport,
                  ...(sport !== form.sport && DEFAULT_MATCH_FORMAT[sport]),
                  ...(sport === 'padel' && { format: 'doubles' }),
                })
              }
            />
            {t.sport[sport]}
          </label>
        ))}
      </div>
      <div className="choice">
        <span>{t.wizard.format}</span>
        {FORMATS.map((format) => (
          <label key={format} className="checkbox">
            <input
              type="radio"
              name="format"
              checked={form.format === format}
              disabled={form.sport === 'padel' && format === 'singles'}
              onChange={() => update({ format })}
            />
            {t.format[format]}
          </label>
        ))}
        {form.sport === 'padel' && <span className="muted">{t.wizard.padelDoubles}</span>}
      </div>
      <label>
        {t.wizard.date}
        <input type="date" value={form.date} onChange={(e) => update({ date: e.target.value })} />
      </label>
      <div className="choice">
        <span>{t.stageLink.title}</span>
        <StageLinkFields value={form.circuit} onChange={(circuit) => update({ circuit })} />
      </div>
    </fieldset>
  );
}

function StructureStep({
  form,
  update,
  entries,
  preview,
}: StepProps & { entries: ReturnType<typeof entriesLabel>; preview: Preview | null }) {
  const { t } = useI18n();
  const withGroups = form.structureType === 'groups_knockout';
  const withList = form.structureType === 'knockout_consolation';
  return (
    <fieldset>
      {!withList && (
        <label>
          {fill(t.wizard.entryCount, { entries: entries.many })}
          <input
            type="number"
            min={2}
            value={form.pairCount}
            onChange={(e) => update({ pairCount: e.target.value })}
          />
        </label>
      )}
      <div className="choice column">
        <span>{t.wizard.structure}</span>
        {STRUCTURE_TYPES.map((type) => (
          <label key={type} className="checkbox">
            <input
              type="radio"
              name="structure"
              checked={form.structureType === type}
              onChange={() => update({ structureType: type })}
            />
            <span>
              {t.structure[type]} <span className="muted">— {t.structureHint[type]}</span>
            </span>
          </label>
        ))}
      </div>
      {withList && <EntryRows form={form} update={update} entries={entries} />}
      {withGroups && (
        <div className="inline-fields">
          <label>
            {t.wizard.groupCount}
            <input
              type="number"
              min={1}
              value={form.groupCount}
              onChange={(e) => update({ groupCount: e.target.value })}
            />
          </label>
          <label>
            {t.wizard.advanceA}
            <input
              type="number"
              min={1}
              value={form.advanceA}
              onChange={(e) => update({ advanceA: e.target.value })}
            />
          </label>
        </div>
      )}
      {withGroups && (
        <label className="checkbox">
          <input
            type="checkbox"
            checked={form.withB}
            onChange={(e) => update({ withB: e.target.checked })}
          />
          {t.wizard.bracketB}
        </label>
      )}
      {withGroups && form.withB && (
        <label>
          {t.wizard.advanceB}
          <input
            type="number"
            min={1}
            value={form.advanceB}
            onChange={(e) => update({ advanceB: e.target.value })}
          />
        </label>
      )}
      <MatchFormatFields
        sport={form.sport}
        sets={form.sets}
        decider={form.decider}
        onChange={update}
      />
      {preview && <PreviewBox preview={preview} entries={entries} />}
    </fieldset>
  );
}

/** The entries of a consolation draw, one row each, with a field per player. */
function EntryRows({
  form,
  update,
  entries,
}: StepProps & { entries: ReturnType<typeof entriesLabel> }) {
  const { t } = useI18n();
  const players = form.sport === 'tennis' && form.format === 'singles' ? 1 : 2;
  const setRow = (row: number, changes: Partial<EntryRow>) =>
    update({
      entryRows: form.entryRows.map((entry, i) => (i === row ? { ...entry, ...changes } : entry)),
    });

  return (
    <div className="entry-rows">
      {form.circuit && <PlayersDatalist />}
      <span>{fill(t.wizard.entryList, { entries: entries.many })}</span>
      <p className="muted">{t.wizard.levelsHint}</p>
      <div className="pair-list">
        {form.entryRows.map((entry, i) => (
          <div key={i} className="pair-row">
            <span className="code">{i + 1}</span>
            <span className="player-inputs">
              {entry.players.slice(0, players).map((name, p) => (
                <input
                  key={p}
                  value={name}
                  maxLength={60}
                  list={form.circuit ? PLAYERS_LIST_ID : undefined}
                  aria-label={fill(t.groups.playerName, { n: p + 1, pair: i + 1 })}
                  onChange={(e) =>
                    setRow(i, {
                      players: entry.players.map((n, k) => (k === p ? e.target.value : n)),
                    })
                  }
                />
              ))}
            </span>
            <select
              aria-label={fill(t.wizard.entryLevel, { entry: entries.one, n: i + 1 })}
              value={entry.level}
              onChange={(e) => setRow(i, { level: Number(e.target.value) })}
            >
              {LEVELS.map((level) => (
                <option key={level} value={level}>
                  {fill(t.wizard.level, { n: level })}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="link"
              aria-label={fill(t.wizard.removeEntry, { entry: entries.one, n: i + 1 })}
              onClick={() => update({ entryRows: form.entryRows.filter((_, k) => k !== i) })}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="inline-fields">
        <button
          type="button"
          className="secondary"
          onClick={() => update({ entryRows: [...form.entryRows, emptyEntryRow()] })}
        >
          {fill(t.wizard.addEntry, { entry: entries.one })}
        </button>
        <span className="muted">
          {fill(t.wizard.entryListCount, { count: form.entryRows.length, entries: entries.many })}
        </span>
      </div>
    </div>
  );
}

function PreviewBox({
  preview,
  entries,
}: {
  preview: Preview;
  entries: ReturnType<typeof entriesLabel>;
}) {
  const { t } = useI18n();
  return (
    <section className="preview" aria-label={t.wizard.preview}>
      <h2>{t.wizard.preview}</h2>
      {preview.groupSizes.length > 0 && (
        <ul>
          {preview.groupSizes.map((count, i) => (
            <li key={i}>
              {fill(t.wizard.groupSize, {
                group: String.fromCharCode(65 + i),
                count,
                entries: count === 1 ? entries.one : entries.many,
              })}
            </li>
          ))}
        </ul>
      )}
      <ul>
        {preview.brackets.map((b) =>
          b.id === 'C' ? (
            <li key={b.id}>{t.wizard.consolation}</li>
          ) : (
            <li key={b.id}>
              {fill(t.wizard.bracket, {
                id: b.id,
                count: b.entrants,
                entries: entries.many,
                round: roundName(t, b.size / 2, 0).toLowerCase(),
              })}
              {b.byes > 0 && ` (${fill(t.wizard.byes, { count: b.byes })})`}
            </li>
          ),
        )}
        <li>
          {fill(
            // The consolation bracket shrinks when pairs after a bye win their first match
            preview.brackets.some((b) => b.id === 'C')
              ? t.wizard.matchesUpTo
              : t.wizard.matchesTotal,
            { count: preview.matchesTotal },
          )}
        </li>
      </ul>
    </section>
  );
}

function CourtsStep({ form, update }: StepProps) {
  const { t } = useI18n();
  const [range, setRange] = useState({ from: '19:00', to: '23:00', every: '30' });
  const [newSlot, setNewSlot] = useState('');

  function setCourtCount(value: string) {
    const count = Math.min(Math.max(Number(value) || 0, 0), MAX_COURTS);
    update({
      courts: Array.from({ length: count }, (_, i) => form.courts[i] ?? defaultCourt(t, i + 1)),
    });
  }

  function addSlot() {
    if (!newSlot) return;
    update({ timeSlots: [...form.timeSlots, newSlot].sort() });
    setNewSlot('');
  }

  return (
    <fieldset>
      <h2>{t.wizard.courts}</h2>
      <label>
        {t.wizard.courtCount}
        <input
          type="number"
          min={1}
          max={MAX_COURTS}
          value={form.courts.length}
          onChange={(e) => setCourtCount(e.target.value)}
        />
      </label>
      <div className="court-names">
        {form.courts.map((court, i) => (
          <label key={i}>
            {fill(t.wizard.courtName, { n: i + 1 })}
            <input
              value={court}
              onChange={(e) =>
                update({ courts: form.courts.map((c, k) => (k === i ? e.target.value : c)) })
              }
            />
          </label>
        ))}
      </div>

      <h2>{t.wizard.timeSlots}</h2>
      <div className="inline-fields">
        <label>
          {t.wizard.from}
          <input
            type="time"
            value={range.from}
            onChange={(e) => setRange({ ...range, from: e.target.value })}
          />
        </label>
        <label>
          {t.wizard.to}
          <input
            type="time"
            value={range.to}
            onChange={(e) => setRange({ ...range, to: e.target.value })}
          />
        </label>
        <label>
          {t.wizard.every}
          <input
            type="number"
            min={5}
            step={5}
            value={range.every}
            onChange={(e) => setRange({ ...range, every: e.target.value })}
          />
        </label>
        <button
          type="button"
          className="secondary"
          onClick={() =>
            update({ timeSlots: generateSlots(range.from, range.to, Number(range.every)) })
          }
        >
          {t.wizard.generate}
        </button>
      </div>
      <ul className="chips">
        {form.timeSlots.length === 0 && <li className="muted">{t.wizard.noSlots}</li>}
        {form.timeSlots.map((time, i) => (
          <li key={`${time}-${i}`}>
            {time}
            <button
              type="button"
              className="link"
              aria-label={fill(t.wizard.removeSlot, { time })}
              onClick={() => update({ timeSlots: form.timeSlots.filter((_, k) => k !== i) })}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="inline-fields">
        <label>
          {t.wizard.newSlot}
          <input type="time" value={newSlot} onChange={(e) => setNewSlot(e.target.value)} />
        </label>
        <button type="button" className="secondary" onClick={addSlot}>
          {t.common.add}
        </button>
      </div>
    </fieldset>
  );
}

function SummaryStep({
  form,
  entries,
  preview,
}: {
  form: Form;
  entries: ReturnType<typeof entriesLabel>;
  preview: Preview | null;
}) {
  const { t } = useI18n();
  const format = form.sport === 'padel' ? 'doubles' : form.format;
  return (
    <fieldset>
      <dl className="summary">
        <dt>{t.wizard.name}</dt>
        <dd>
          {form.name}
          {form.subtitle && ` — ${form.subtitle}`}
        </dd>
        <dt>{t.wizard.sport}</dt>
        <dd>{`${t.sport[form.sport]} · ${t.format[format]}`}</dd>
        <dt>{t.wizard.date}</dt>
        <dd>{form.date}</dd>
        <dt>{entries.Many}</dt>
        <dd>
          {form.structureType === 'knockout_consolation' ? form.entryRows.length : form.pairCount}
        </dd>
        <dt>{t.wizard.structure}</dt>
        <dd>{t.structure[form.structureType]}</dd>
        <dt>{t.wizard.matchFormat}</dt>
        <dd>{matchFormatName(t, buildMatchFormat(form.sets, form.decider))}</dd>
        <dt>{t.wizard.courts}</dt>
        <dd>{form.courts.join(', ')}</dd>
        <dt>{t.wizard.timeSlots}</dt>
        <dd>{form.timeSlots.join(', ')}</dd>
      </dl>
      {preview && <PreviewBox preview={preview} entries={entries} />}
    </fieldset>
  );
}
