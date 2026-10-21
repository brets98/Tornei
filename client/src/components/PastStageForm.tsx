import { useState, type FormEvent } from 'react';
import { fill, useI18n } from '../i18n/context';
import { ApiError, apiPost, apiPut } from '../lib/api';
import { PLACES, PLAYERS_LIST_ID, type Circuit, type PastStage, type Place } from '../lib/circuits';
import { issueMessage, type Issue } from '../lib/tournaments';
import { PlayersDatalist } from './PlayersDatalist';

const ALL_PLACES: Place[] = [...PLACES, 'groups'];
/** Rows a new past stage starts with */
const INITIAL_ROWS = 4;

interface Row {
  players: string[];
  place: Place | '';
}

const emptyRow = (): Row => ({ players: ['', ''], place: '' });

interface Props {
  circuit: Circuit;
  /** The stage to edit; a new one when missing */
  stage?: PastStage;
  /** After saving (`true`) or cancelling */
  onDone: (saved: boolean) => void;
}

/**
 * A stage played before it was in the app: name, date, category and each entry's players
 * with how far they got. Saved as a whole.
 */
export function PastStageForm({ circuit, stage, onDone }: Props) {
  const { t } = useI18n();
  const [name, setName] = useState(stage?.name ?? '');
  const [date, setDate] = useState(stage?.date ?? '');
  const [categoryId, setCategoryId] = useState(
    stage?.categoryId ?? circuit.categories[0]?.id ?? '',
  );
  const [rows, setRows] = useState<Row[]>(() =>
    stage
      ? stage.entries.map((e) => ({
          players: [e.players[0] ?? '', e.players[1] ?? ''],
          place: e.place,
        }))
      : Array.from({ length: INITIAL_ROWS }, emptyRow),
  );
  const [issues, setIssues] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const setRow = (index: number, changes: Partial<Row>) =>
    setRows((list) => list.map((row, i) => (i === index ? { ...row, ...changes } : row)));

  async function save(event: FormEvent) {
    event.preventDefault();
    setIssues([]);
    setSaving(true);
    const body = {
      name,
      date,
      categoryId,
      // A single name is a singles entry
      entries: rows.map((row) => ({
        players: row.players.filter((p, i) => i === 0 || p.trim()),
        place: row.place,
      })),
    };
    try {
      if (stage) await apiPut(`/circuits/${circuit.id}/stages/${stage.id}`, body);
      else await apiPost(`/circuits/${circuit.id}/stages`, body);
      onDone(true);
    } catch (err) {
      const found = err instanceof ApiError ? (err.body.issues as Issue[] | undefined) : undefined;
      setIssues(found?.length ? found.map((i) => issueMessage(t, i)) : [t.circuits.saveError]);
      setSaving(false);
    }
  }

  return (
    <form className="panel settings past-stage" onSubmit={save}>
      <h3>{stage ? t.pastStage.editTitle : t.pastStage.newTitle}</h3>
      <p className="muted">{t.pastStage.hint}</p>
      <PlayersDatalist />
      <div className="inline-fields">
        <label>
          {t.pastStage.name}
          <input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          {t.circuits.date}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          {t.circuits.category}
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {circuit.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <span>{t.pastStage.entries}</span>
      <div className="pair-list">
        {rows.map((row, i) => (
          <div key={i} className="pair-row">
            <span className="code">{i + 1}</span>
            <span className="player-inputs">
              {row.players.map((player, p) => (
                <input
                  key={p}
                  value={player}
                  maxLength={60}
                  list={PLAYERS_LIST_ID}
                  aria-label={fill(t.groups.playerName, { n: p + 1, pair: i + 1 })}
                  onChange={(e) =>
                    setRow(i, {
                      players: row.players.map((n, k) => (k === p ? e.target.value : n)),
                    })
                  }
                />
              ))}
            </span>
            <select
              aria-label={fill(t.pastStage.placeOf, { n: i + 1 })}
              value={row.place}
              onChange={(e) => setRow(i, { place: e.target.value as Place })}
            >
              <option value="">{t.pastStage.choosePlace}</option>
              {ALL_PLACES.map((place) => (
                <option key={place} value={place}>
                  {t.places[place]}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="link"
              aria-label={fill(t.pastStage.removeEntry, { n: i + 1 })}
              onClick={() => setRows((list) => list.filter((_, k) => k !== i))}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="secondary"
        onClick={() => setRows((list) => [...list, emptyRow()])}
      >
        {t.pastStage.addEntry}
      </button>

      {issues.length > 0 && (
        <ul className="issues" role="alert">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
      <div className="actions">
        <button type="submit" disabled={saving}>
          {t.circuits.save}
        </button>
        <button type="button" className="secondary" onClick={() => onDone(false)}>
          {t.pastStage.cancel}
        </button>
      </div>
    </form>
  );
}
