import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { fill, useI18n } from '../i18n/context';
import { ApiError, apiDelete, apiGet, apiPost } from '../lib/api';
import type { CircuitListItem } from '../lib/circuits';
import { issueMessage, type Issue } from '../lib/tournaments';

type State =
  { status: 'loading' } | { status: 'error' } | { status: 'ok'; circuits: CircuitListItem[] };

const issuesOf = (err: unknown) =>
  err instanceof ApiError ? (err.body.issues as Issue[] | undefined) : undefined;

/** The user's circuits, and a form to start a new one. */
export function CircuitsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [form, setForm] = useState({ name: '', season: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    apiGet<CircuitListItem[]>('/circuits')
      .then((circuits) => setState({ status: 'ok', circuits }))
      .catch(() => setState({ status: 'error' }));
  }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const circuit = await apiPost<CircuitListItem>('/circuits', form);
      navigate(`/circuits/${circuit.id}`);
    } catch (err) {
      const issues = issuesOf(err);
      setError(
        issues?.length ? issues.map((i) => issueMessage(t, i)).join(' ') : t.common.saveError,
      );
    }
  }

  async function remove(circuit: CircuitListItem) {
    if (!window.confirm(fill(t.circuits.confirmDelete, { name: circuit.name }))) return;
    setError('');
    try {
      await apiDelete(`/circuits/${circuit.id}`);
      setState((s) =>
        s.status === 'ok' ? { ...s, circuits: s.circuits.filter((c) => c.id !== circuit.id) } : s,
      );
    } catch (err) {
      const issues = issuesOf(err);
      setError(
        issues?.length ? issues.map((i) => issueMessage(t, i)).join(' ') : t.circuits.deleteError,
      );
    }
  }

  return (
    <article className="page wide">
      <h1>{t.circuits.title}</h1>
      <p className="muted">{t.circuits.hint}</p>

      <form className="panel settings" onSubmit={create}>
        <h3>{t.circuits.newCircuit}</h3>
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
              placeholder="2027"
              onChange={(e) => setForm({ ...form, season: e.target.value })}
            />
          </label>
          <button type="submit" disabled={!form.name.trim()}>
            {t.circuits.create}
          </button>
        </div>
        <p className="muted">{t.circuits.createHint}</p>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {state.status === 'loading' && <p>{t.common.loading}</p>}
      {state.status === 'error' && <p className="error">{t.common.loadError}</p>}
      {state.status === 'ok' && state.circuits.length === 0 && (
        <p className="muted">{t.circuits.empty}</p>
      )}
      {state.status === 'ok' && state.circuits.length > 0 && (
        <div className="table-wrap">
          <table className="tournament-list">
            <thead>
              <tr>
                <th>{t.circuits.name}</th>
                <th>{t.circuits.season}</th>
                <th>{t.circuits.stages}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {state.circuits.map((circuit) => (
                <tr key={circuit.id}>
                  <td>
                    <Link to={`/circuits/${circuit.id}`} className="tournament-name">
                      {circuit.name}
                    </Link>
                  </td>
                  <td>{circuit.season}</td>
                  <td>{fill(t.circuits.stageCount, { count: circuit.stageCount })}</td>
                  <td className="row-actions">
                    <Link className="button secondary" to={`/circuits/${circuit.id}`}>
                      {t.circuits.open}
                    </Link>
                    <button
                      type="button"
                      className="secondary danger"
                      onClick={() => remove(circuit)}
                    >
                      {t.circuits.delete}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
