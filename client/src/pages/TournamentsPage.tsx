import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { fill, useI18n } from '../i18n/context';
import { apiDelete, apiGet, apiPost } from '../lib/api';
import { formatDate, type Tournament, type TournamentListItem } from '../lib/tournaments';

type State =
  { status: 'loading' } | { status: 'error' } | { status: 'ok'; tournaments: TournamentListItem[] };

/** Home after sign-in: the user's tournaments. */
export function TournamentsPage() {
  const { t } = useI18n();
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
    if (!window.confirm(fill(t.list.confirmDelete, { name: tournament.name }))) return;
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
      setError(t.list.deleteError);
    } finally {
      setBusy(false);
    }
  }

  async function duplicate(tournament: TournamentListItem) {
    setError('');
    setBusy(true);
    try {
      const copy = await apiPost<Tournament>(`/tournaments/${tournament.id}/duplicate`, {
        name: fill(t.list.copyName, { name: tournament.name }),
      });
      navigate(`/tournaments/${copy.id}`);
    } catch {
      setError(t.list.duplicateError);
      setBusy(false);
    }
  }

  return (
    <article className="page wide">
      <div className="page-head">
        <h1>{t.list.title}</h1>
        <Link className="button" to="/tournaments/new">
          {t.list.new}
        </Link>
      </div>

      {state.status === 'loading' && <p>{t.common.loading}</p>}
      {state.status === 'error' && <p className="error">{t.common.loadError}</p>}
      {error && <p className="error">{error}</p>}
      {state.status === 'ok' && state.tournaments.length === 0 && (
        <p className="muted">{t.list.empty}</p>
      )}
      {state.status === 'ok' && state.tournaments.length > 0 && (
        <div className="table-wrap">
          <table className="tournament-list">
            <thead>
              <tr>
                <th>{t.list.name}</th>
                <th>{t.list.sport}</th>
                <th>{t.list.date}</th>
                <th>{t.list.status}</th>
                <th>{t.list.progress}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {state.tournaments.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link to={`/tournaments/${item.id}`} className="tournament-name">
                      {item.name}
                    </Link>
                    {item.subtitle && <span className="muted block">{item.subtitle}</span>}
                  </td>
                  <td>{`${t.sport[item.sport]} · ${t.format[item.format]}`}</td>
                  <td>{formatDate(item.date)}</td>
                  <td>
                    <span className={`badge status-${item.summary.status}`}>
                      {t.status[item.summary.status]}
                    </span>
                  </td>
                  <td>
                    <div className="progress">
                      <progress
                        value={item.summary.matchesDone}
                        max={Math.max(item.summary.matchesTotal, 1)}
                      />
                      <span>
                        {fill(t.list.progressValue, {
                          done: item.summary.matchesDone,
                          total: item.summary.matchesTotal,
                        })}
                      </span>
                    </div>
                  </td>
                  <td className="row-actions">
                    <Link className="button secondary" to={`/tournaments/${item.id}`}>
                      {t.list.open}
                    </Link>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => duplicate(item)}
                    >
                      {t.list.duplicate}
                    </button>
                    <button
                      type="button"
                      className="secondary danger"
                      disabled={busy}
                      onClick={() => remove(item)}
                    >
                      {t.list.delete}
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
