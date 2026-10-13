import { useState, type FormEvent } from 'react';
import { fill, useI18n } from '../../i18n/context';
import { apiGet } from '../../lib/api';
import { buildMatchFormat, setsChoice, type Decider, type SetsChoice } from '../../lib/score';
import { isStructureLocked, type Tournament } from '../../lib/tournaments';
import type { SettingsChanges, TournamentActions } from './actions';
import { MatchFormatFields } from './MatchFormatFields';

interface Form {
  name: string;
  subtitle: string;
  date: string;
  courts: { id?: string; name: string }[];
  timeSlots: { id?: string; time: string }[];
  sets: SetsChoice;
  decider: Decider;
}

const formOf = (tournament: Tournament): Form => ({
  name: tournament.name,
  subtitle: tournament.subtitle,
  date: tournament.date,
  courts: tournament.courts.map(({ id, name }) => ({ id, name })),
  timeSlots: tournament.timeSlots.map(({ id, time }) => ({ id, time })),
  sets: setsChoice(tournament.matchFormat),
  decider: tournament.matchFormat.decider,
});

/** A file name from the tournament name: 'Torneo di primavera' → 'torneo-di-primavera.json'. */
function fileName(name: string) {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug || 'tournament'}.json`;
}

/**
 * Name, date, courts, times and match format, saved together; then export and reset. Shown
 * again from scratch after each save (TournamentPage keys it on `updatedAt`).
 */
export function SettingsView({
  tournament,
  actions,
}: {
  tournament: Tournament;
  actions: TournamentActions;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<Form>(() => formOf(tournament));
  const [newSlot, setNewSlot] = useState('');
  const [exportError, setExportError] = useState('');
  const update = (changes: Partial<Form>) => setForm((f) => ({ ...f, ...changes }));
  const dirty = JSON.stringify(form) !== JSON.stringify(formOf(tournament));
  const locked = isStructureLocked(tournament);
  const results = tournament.matches.filter((m) => m.sets.length > 0).length;

  function save(event: FormEvent) {
    event.preventDefault();
    // Courts and slots being removed that some match uses: say which, and ask first
    const uses = (key: 'courtId' | 'timeSlotId', id: string) =>
      tournament.matches.filter((m) => m[key] === id).length;
    const removed = [
      ...tournament.courts
        .filter((c) => !form.courts.some((f) => f.id === c.id))
        .map((c) => ({ name: c.name, count: uses('courtId', c.id) })),
      ...tournament.timeSlots
        .filter((s) => !form.timeSlots.some((f) => f.id === s.id))
        .map((s) => ({ name: s.time, count: uses('timeSlotId', s.id) })),
    ].filter((item) => item.count > 0);
    if (
      removed.length > 0 &&
      !window.confirm(
        fill(t.settings.confirmRemove, {
          items: removed.map((item) => fill(t.settings.inUse, item)).join(', '),
        }),
      )
    ) {
      return;
    }
    const changes: SettingsChanges = {
      name: form.name,
      subtitle: form.subtitle,
      date: form.date,
      courts: form.courts,
      timeSlots: form.timeSlots,
      matchFormat: buildMatchFormat(form.sets, form.decider),
    };
    actions.updateSettings(changes);
  }

  function addSlot() {
    if (!newSlot) return;
    update({
      timeSlots: [...form.timeSlots, { time: newSlot }].sort((a, b) =>
        a.time.localeCompare(b.time),
      ),
    });
    setNewSlot('');
  }

  async function exportFile() {
    setExportError('');
    try {
      const file = await apiGet<unknown>(`/tournaments/${tournament.id}/export`);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName(tournament.name);
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError(t.settings.exportError);
    }
  }

  function reset() {
    if (window.confirm(fill(t.settings.confirmReset, { count: results, name: tournament.name }))) {
      actions.resetResults();
    }
  }

  return (
    <section>
      <div className="view-title">
        <h2>{t.settings.title}</h2>
        <p>{t.settings.hint}</p>
      </div>
      <form className="panel settings" onSubmit={save}>
        <h3>{t.settings.general}</h3>
        <label>
          {t.wizard.name}
          <input value={form.name} onChange={(e) => update({ name: e.target.value })} />
        </label>
        <label>
          {t.wizard.subtitle}
          <input value={form.subtitle} onChange={(e) => update({ subtitle: e.target.value })} />
        </label>
        <label>
          {t.wizard.date}
          <input type="date" value={form.date} onChange={(e) => update({ date: e.target.value })} />
        </label>

        <h3>{t.settings.courts}</h3>
        <ul className="court-editor">
          {form.courts.map((court, i) => (
            <li key={court.id ?? `new-${i}`}>
              <input
                aria-label={fill(t.settings.courtName, { n: i + 1 })}
                value={court.name}
                onChange={(e) =>
                  update({
                    courts: form.courts.map((c, k) =>
                      k === i ? { ...c, name: e.target.value } : c,
                    ),
                  })
                }
              />
              <button
                type="button"
                className="link"
                aria-label={fill(t.settings.removeCourt, { name: court.name || i + 1 })}
                onClick={() => update({ courts: form.courts.filter((_, k) => k !== i) })}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="secondary"
          onClick={() =>
            update({
              courts: [
                ...form.courts,
                { name: fill(t.wizard.defaultCourt, { n: form.courts.length + 1 }) },
              ],
            })
          }
        >
          {t.settings.addCourt}
        </button>

        <h3>{t.settings.timeSlots}</h3>
        <ul className="chips">
          {form.timeSlots.length === 0 && <li className="muted">{t.wizard.noSlots}</li>}
          {form.timeSlots.map((slot, i) => (
            <li key={slot.id ?? `new-${slot.time}-${i}`}>
              {slot.time}
              <button
                type="button"
                className="link"
                aria-label={fill(t.wizard.removeSlot, { time: slot.time })}
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

        <h3>{t.wizard.matchFormat}</h3>
        {locked && <p className="muted">{t.settings.formatLocked}</p>}
        <MatchFormatFields
          sport={tournament.sport}
          sets={form.sets}
          decider={form.decider}
          disabled={locked}
          onChange={update}
        />

        <div className="actions">
          <button type="submit" disabled={!dirty}>
            {t.settings.save}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={!dirty}
            onClick={() => setForm(formOf(tournament))}
          >
            {t.settings.discard}
          </button>
        </div>
      </form>

      <div className="panel settings">
        <h3>{t.settings.data}</h3>
        <p className="muted">{t.settings.exportHint}</p>
        <button type="button" className="secondary" onClick={exportFile}>
          {t.settings.export}
        </button>
        {exportError && <p className="error">{exportError}</p>}
        <p className="muted">{t.settings.resetHint}</p>
        <button type="button" className="secondary danger" disabled={results === 0} onClick={reset}>
          {t.settings.reset}
        </button>
      </div>
    </section>
  );
}
