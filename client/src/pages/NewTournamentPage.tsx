import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import type { Messages } from '../i18n/en';
import { fill, useI18n } from '../i18n/context';
import { ApiError, apiPost } from '../lib/api';
import {
  entriesLabel,
  issueMessage,
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
  structureType: StructureType;
  groupCount: string;
  advanceA: string;
  withB: boolean;
  advanceB: string;
  courts: string[];
  timeSlots: string[];
}

const STRUCTURE_TYPES: StructureType[] = ['groups_knockout', 'knockout', 'groups'];
const SPORTS: Sport[] = ['padel', 'tennis'];
const FORMATS: Format[] = ['doubles', 'singles'];
const MAX_COURTS = 20;
const PREVIEW_DELAY_MS = 250;

/** Which wizard step each issue belongs to (unknown codes go to the summary). */
const STEP_OF_ISSUE: [RegExp, number][] = [
  [/^(NAME_|SPORT_|FORMAT_|PADEL_|DATE_)/, 0],
  [/^(PAIR_|STRUCTURE_|GROUP_|ADVANCE_|BRACKET_)/, 1],
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

const initialForm = (t: Messages): Form => ({
  name: '',
  subtitle: '',
  sport: 'padel',
  format: 'doubles',
  date: today(),
  pairCount: '12',
  structureType: 'groups_knockout',
  groupCount: '4',
  advanceA: '2',
  withB: true,
  advanceB: '1',
  courts: [1, 2, 3, 4].map((n) => defaultCourt(t, n)),
  timeSlots: generateSlots('19:00', '23:00', 30),
});

/** What the API expects (see parseSetup on the server). Empty numbers become null: invalid. */
function toSetup(form: Form) {
  const number = (value: string) => (value.trim() === '' ? null : Number(value));
  return {
    name: form.name,
    subtitle: form.subtitle,
    sport: form.sport,
    format: form.sport === 'padel' ? 'doubles' : form.format,
    date: form.date,
    pairCount: number(form.pairCount),
    courts: form.courts,
    timeSlots: form.timeSlots,
    structure: {
      type: form.structureType,
      groupCount: number(form.groupCount),
      advanceA: number(form.advanceA),
      advanceB: form.withB ? number(form.advanceB) : 0,
    },
  };
}

export function NewTournamentPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [form, setForm] = useState<Form>(() => initialForm(t));
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
              onChange={() => update({ sport, ...(sport === 'padel' && { format: 'doubles' }) })}
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
  return (
    <fieldset>
      <label>
        {fill(t.wizard.entryCount, { entries: entries.many })}
        <input
          type="number"
          min={2}
          value={form.pairCount}
          onChange={(e) => update({ pairCount: e.target.value })}
        />
      </label>
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
      {preview && <PreviewBox preview={preview} entries={entries} />}
    </fieldset>
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
        {preview.brackets.map((b) => (
          <li key={b.id}>
            {fill(t.wizard.bracket, {
              id: b.id,
              count: b.entrants,
              entries: entries.many,
              round: roundName(t, b.size / 2, 0).toLowerCase(),
            })}
            {b.byes > 0 && ` (${fill(t.wizard.byes, { count: b.byes })})`}
          </li>
        ))}
        <li>{fill(t.wizard.matchesTotal, { count: preview.matchesTotal })}</li>
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
        <dd>{form.pairCount}</dd>
        <dt>{t.wizard.structure}</dt>
        <dd>{t.structure[form.structureType]}</dd>
        <dt>{t.wizard.courts}</dt>
        <dd>{form.courts.join(', ')}</dd>
        <dt>{t.wizard.timeSlots}</dt>
        <dd>{form.timeSlots.join(', ')}</dd>
      </dl>
      {preview && <PreviewBox preview={preview} entries={entries} />}
    </fieldset>
  );
}
