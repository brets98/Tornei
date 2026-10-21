import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { PastStageForm } from '../components/PastStageForm';
import { fill, useI18n } from '../i18n/context';
import { ApiError, apiDelete, apiGet, apiPatch } from '../lib/api';
import { PLACES, placeAt, type Category, type Circuit, type Stage } from '../lib/circuits';
import { formatDate, issueMessage, type Issue } from '../lib/tournaments';

type State =
  | { status: 'loading' }
  | { status: 'error'; notFound: boolean }
  | { status: 'ok'; circuit: Circuit };

const TABS = ['ranking', 'stages', 'settings'] as const;
type Tab = (typeof TABS)[number];

/** A circuit: its ranking, its stages and its settings (categories and points). */
export function CircuitPage() {
  const { id } = useParams();
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(
    () =>
      apiGet<Circuit>(`/circuits/${id}`)
        .then((circuit) => setState({ status: 'ok', circuit }))
        .catch((err: unknown) =>
          setState({ status: 'error', notFound: err instanceof ApiError && err.status === 404 }),
        ),
    [id],
  );

  useEffect(() => {
    load();
  }, [load]);

  if (state.status === 'loading') return <p className="page">{t.common.loading}</p>;
  if (state.status === 'error') {
    return (
      <p className="page error">{state.notFound ? t.circuits.notFound : t.common.loadError}</p>
    );
  }

  const { circuit } = state;
  const requested = searchParams.get('tab') as Tab | null;
  const tab = requested && TABS.includes(requested) ? requested : 'ranking';

  return (
    <article className="tournament">
      <header className="tournament-head">
        <div className="eyebrow">{t.circuits.eyebrow}</div>
        <h1>
          {circuit.name}
          {circuit.season && <span>{circuit.season}</span>}
        </h1>
        <div>
          <Link className="button" to={`/tournaments/new?circuit=${circuit.id}`}>
            {t.circuits.newStage}
          </Link>
        </div>
      </header>
      <nav className="tabs" aria-label={circuit.name}>
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            className={`tab${name === tab ? ' active' : ''}`}
            aria-current={name === tab ? 'page' : undefined}
            onClick={() => setSearchParams(name === 'ranking' ? {} : { tab: name })}
          >
            {t.circuits.tabs[name]}
          </button>
        ))}
      </nav>
      {tab === 'ranking' && <RankingView circuit={circuit} />}
      {tab === 'stages' && <StagesView circuit={circuit} onChanged={load} />}
      {tab === 'settings' && (
        <CircuitSettings key={circuit.updatedAt} circuit={circuit} onSaved={load} />
      )}
    </article>
  );
}

function RankingView({ circuit }: { circuit: Circuit }) {
  const { t } = useI18n();
  const stage = (id: string) => circuit.stages.find((s) => s.id === id);

  return (
    <section>
      <div className="view-title">
        <h2>{t.circuits.tabs.ranking}</h2>
        <p>{t.circuits.rankingHint}</p>
      </div>
      {circuit.unlinked.map(({ stageId, count }) => (
        <p key={stageId} className="warning">
          {fill(t.circuits.unlinked, { stage: stage(stageId)?.name ?? '', count })}
        </p>
      ))}
      {circuit.ranking.length === 0 ? (
        <p className="muted">{t.circuits.noRanking}</p>
      ) : (
        <div className="table-wrap panel">
          <table className="standings ranking">
            <thead>
              <tr>
                <th>{t.circuits.position}</th>
                <th>{t.circuits.player}</th>
                <th>{t.circuits.points}</th>
                <th>{t.circuits.stages}</th>
                <th>{t.circuits.wins}</th>
                <th>{t.circuits.best}</th>
              </tr>
            </thead>
            <tbody>
              {circuit.ranking.map((row, i) => (
                <tr key={row.playerId}>
                  <td>{i + 1}</td>
                  <td>
                    <details>
                      <summary>{row.name}</summary>
                      <ul className="stage-points" aria-label={t.circuits.showDetails}>
                        {row.results.map((r) => (
                          <li key={r.stageId}>
                            {stage(r.stageId)?.past ? (
                              stage(r.stageId)?.name
                            ) : (
                              <Link to={`/tournaments/${r.stageId}`}>{stage(r.stageId)?.name}</Link>
                            )}
                            {` · ${t.places[r.place]} · ${r.points}`}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </td>
                  <td>
                    <strong>{row.points}</strong>
                  </td>
                  <td>{row.stages}</td>
                  <td>{row.wins}</td>
                  <td>{t.places[placeAt(row.best)]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** The stages, newest first: tournaments, and past stages entered as results only. */
function StagesView({ circuit, onChanged }: { circuit: Circuit; onChanged: () => void }) {
  const { t } = useI18n();
  /** The past stage being edited: 'new', its id, or null */
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const category = (id: string) => circuit.categories.find((c) => c.id === id)?.name ?? '';

  if (editing) {
    return (
      <PastStageForm
        circuit={circuit}
        stage={circuit.pastStages.find((s) => s.id === editing)}
        onDone={(saved) => {
          setEditing(null);
          if (saved) onChanged();
        }}
      />
    );
  }

  async function remove(stage: Stage) {
    if (!window.confirm(fill(t.pastStage.confirmDelete, { name: stage.name }))) return;
    setError('');
    try {
      await apiDelete(`/circuits/${circuit.id}/stages/${stage.id}`);
      onChanged();
    } catch {
      setError(t.circuits.saveError);
    }
  }

  return (
    <section>
      <div className="view-toolbar">
        <p className="muted">{t.pastStage.toolbarHint}</p>
        <button type="button" className="secondary" onClick={() => setEditing('new')}>
          {t.pastStage.add}
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {circuit.stages.length === 0 ? (
        <p className="muted">{t.circuits.noStages}</p>
      ) : (
        <div className="table-wrap">
          <table className="tournament-list">
            <thead>
              <tr>
                <th>{t.circuits.stage}</th>
                <th>{t.circuits.date}</th>
                <th>{t.circuits.category}</th>
                <th>{t.circuits.status}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {circuit.stages.map((stage) => (
                <tr key={stage.id}>
                  <td>
                    {stage.past ? (
                      <span className="tournament-name">{stage.name}</span>
                    ) : (
                      <Link to={`/tournaments/${stage.id}`} className="tournament-name">
                        {stage.name}
                      </Link>
                    )}
                  </td>
                  <td>{formatDate(stage.date)}</td>
                  <td>{category(stage.categoryId)}</td>
                  <td>
                    {stage.summary ? (
                      <span className={`badge status-${stage.summary.status}`}>
                        {t.status[stage.summary.status]}
                      </span>
                    ) : (
                      <span className="badge status-finished">{t.pastStage.badge}</span>
                    )}
                  </td>
                  <td className="row-actions">
                    {stage.past && (
                      <>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => setEditing(stage.id)}
                        >
                          {t.pastStage.edit}
                        </button>
                        <button
                          type="button"
                          className="secondary danger"
                          onClick={() => remove(stage)}
                        >
                          {t.pastStage.delete}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

interface Form {
  name: string;
  season: string;
  categories: Category[];
}

const formOf = (circuit: Circuit): Form => ({
  name: circuit.name,
  season: circuit.season,
  categories: circuit.categories,
});

/** Name, season, and the points table: one column per category. */
function CircuitSettings({ circuit, onSaved }: { circuit: Circuit; onSaved: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState<Form>(() => formOf(circuit));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(formOf(circuit));

  const setCategory = (index: number, change: (c: Category) => Category) =>
    setForm((f) => ({
      ...f,
      categories: f.categories.map((c, i) => (i === index ? change(c) : c)),
    }));
  const setPoints = (index: number, key: number | 'groups' | 'participation', value: number) =>
    setCategory(index, (c) => ({
      ...c,
      points:
        typeof key === 'number'
          ? { ...c.points, places: c.points.places.map((p, k) => (k === key ? value : p)) }
          : { ...c.points, [key]: value },
    }));

  function addCategory() {
    const last = form.categories.at(-1);
    setForm((f) => ({
      ...f,
      categories: [
        ...f.categories,
        {
          name: fill(t.circuits.newCategory, { n: f.categories.length + 1 }),
          points: last
            ? structuredClone(last.points)
            : { places: PLACES.map(() => 0), groups: 0, participation: 0 },
        },
      ],
    }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await apiPatch(`/circuits/${circuit.id}`, form);
      onSaved();
    } catch (err) {
      const issues = err instanceof ApiError ? (err.body.issues as Issue[] | undefined) : undefined;
      setError(
        issues?.length ? issues.map((i) => issueMessage(t, i)).join(' ') : t.circuits.saveError,
      );
      setSaving(false);
    }
  }

  const pointsInput = (
    index: number,
    category: Category,
    key: number | 'groups' | 'participation',
    label: string,
  ) => (
    <input
      type="number"
      min={0}
      step={1}
      className="points-input"
      aria-label={fill(t.circuits.pointsOf, { place: label, category: category.name })}
      value={typeof key === 'number' ? category.points.places[key] : category.points[key]}
      onChange={(e) => setPoints(index, key, e.target.valueAsNumber)}
    />
  );

  return (
    <form className="panel settings" onSubmit={save}>
      <h3>{t.circuits.tabs.settings}</h3>
      <div className="inline-fields">
        <label>
          {t.circuits.name}
          <input
            value={form.name}
            maxLength={100}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label>
          {t.circuits.season}
          <input
            value={form.season}
            maxLength={40}
            onChange={(e) => setForm({ ...form, season: e.target.value })}
          />
        </label>
      </div>

      <h3>{t.circuits.categories}</h3>
      <p className="muted">{t.circuits.categoriesHint}</p>
      <div className="table-wrap">
        <table className="points-table">
          <thead>
            <tr>
              <th>{t.circuits.result}</th>
              {form.categories.map((category, i) => (
                <th key={category.id ?? `new-${i}`}>
                  <span className="category-head">
                    <input
                      aria-label={fill(t.circuits.categoryName, { n: i + 1 })}
                      value={category.name}
                      maxLength={40}
                      onChange={(e) => setCategory(i, (c) => ({ ...c, name: e.target.value }))}
                    />
                    <button
                      type="button"
                      className="link"
                      aria-label={fill(t.circuits.removeCategory, { name: category.name })}
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          categories: f.categories.filter((_, k) => k !== i),
                        }))
                      }
                    >
                      ×
                    </button>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PLACES.map((place, p) => (
              <tr key={place}>
                <th scope="row">{t.places[place]}</th>
                {form.categories.map((category, i) => (
                  <td key={category.id ?? `new-${i}`}>
                    {pointsInput(i, category, p, t.places[place])}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <th scope="row">{t.places.groups}</th>
              {form.categories.map((category, i) => (
                <td key={category.id ?? `new-${i}`}>
                  {pointsInput(i, category, 'groups', t.places.groups)}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">
                {t.circuits.participation}
                <span className="muted block">{t.circuits.participationHint}</span>
              </th>
              {form.categories.map((category, i) => (
                <td key={category.id ?? `new-${i}`}>
                  {pointsInput(i, category, 'participation', t.circuits.participation)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <button type="button" className="secondary" onClick={addCategory}>
        {t.circuits.addCategory}
      </button>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="submit" disabled={!dirty || saving}>
          {t.circuits.save}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={!dirty || saving}
          onClick={() => setForm(formOf(circuit))}
        >
          {t.circuits.discard}
        </button>
      </div>
    </form>
  );
}
