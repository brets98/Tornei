import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { fill, it } from '../i18n/it';
import { apiDelete, apiGet, apiPost } from '../lib/api';
import { formatDate, type Tournament, type TournamentListItem } from '../lib/tournaments';

type State =
  { status: 'loading' } | { status: 'error' } | { status: 'ok'; tournaments: TournamentListItem[] };

/** Home after sign-in: the user's tournaments. */
export function TournamentsPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiGet<TournamentListItem[]>('/tournaments')
      .then((tournaments) => setState({ status: 'ok', tournaments }))
      .catch(() => setState({ status: 'error' }));
  }, []);

  async function remove(tournament: TournamentListItem) {
    if (!window.confirm(fill(it.list.confirmDelete, { name: tournament.name }))) return;
    setError('');
    setBusy(true);
    try {
      await apiDelete(`/tournaments/${tournament.id}`);
      setState((s) =>
        s.status === 'ok'
          ? { ...s, tournaments: s.tournaments.filter((x) => x.id !== tournament.id) }
          : s,
      );
    } catch {
      setError(it.list.deleteError);
    } finally {
      setBusy(false);
    }
  }

  async function duplicate(tournament: TournamentListItem) {
    setError('');
    setBusy(true);
    try {
      const copy = await apiPost<Tournament>(`/tournaments/${tournament.id}/duplicate`);
      navigate(`/tournaments/${copy.id}`);
    } catch {
      setError(it.list.duplicateError);
      setBusy(false);
    }
  }

  return (
    <article className="page wide">
      <div className="page-head">
        <h1>{it.list.title}</h1>
        <Link className="button" to="/tournaments/new">
          {it.list.new}
        </Link>
      </div>

      {state.status === 'loading' && <p>{it.common.loading}</p>}
      {state.status === 'error' && <p className="error">{it.common.loadError}</p>}
      {error && <p className="error">{error}</p>}
      {state.status === 'ok' && state.tournaments.length === 0 && (
        <p className="muted">{it.list.empty}</p>
      )}
      {state.status === 'ok' && state.tournaments.length > 0 && (
        <div className="table-wrap">
          <table className="tournament-list">
            <thead>
              <tr>
                <th>{it.list.name}</th>
                <th>{it.list.sport}</th>
                <th>{it.list.date}</th>
                <th>{it.list.status}</th>
                <th>{it.list.progress}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {state.tournaments.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link to={`/tournaments/${t.id}`} className="tournament-name">
                      {t.name}
                    </Link>
                    {t.subtitle && <span className="muted block">{t.subtitle}</span>}
                  </td>
                  <td>{`${it.sport[t.sport]} · ${it.format[t.format]}`}</td>
                  <td>{formatDate(t.date)}</td>
                  <td>
                    <span className={`badge status-${t.summary.status}`}>
                      {it.status[t.summary.status]}
                    </span>
                  </td>
                  <td>
                    <Progress done={t.summary.matchesDone} total={t.summary.matchesTotal} />
                  </td>
                  <td className="row-actions">
                    <Link className="button secondary" to={`/tournaments/${t.id}`}>
                      {it.list.open}
                    </Link>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => duplicate(t)}
                    >
                      {it.list.duplicate}
                    </button>
                    <button
                      type="button"
                      className="secondary danger"
                      disabled={busy}
                      onClick={() => remove(t)}
                    >
                      {it.list.delete}
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

function Progress({ done, total }: { done: number; total: number }) {
  return (
    <div className="progress">
      <progress value={done} max={Math.max(total, 1)} />
      <span>{fill(it.list.progressValue, { done, total })}</span>
    </div>
  );
}
