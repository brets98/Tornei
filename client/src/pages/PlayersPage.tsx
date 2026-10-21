import { useEffect, useState, type FormEvent } from 'react';
import { CommitInput } from '../components/tournament/CommitInput';
import { fill, useI18n } from '../i18n/context';
import { ApiError, apiDelete, apiGet, apiPatch, apiPost } from '../lib/api';
import type { Player } from '../lib/circuits';
import { issueMessage, type Issue } from '../lib/tournaments';

type State = { status: 'loading' } | { status: 'error' } | { status: 'ok'; players: Player[] };

const byName = (a: Player, b: Player) => a.name.localeCompare(b.name);

/** The player registry: add, rename (also in every tournament) and delete players. */
export function PlayersPage() {
  const { t } = useI18n();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    apiGet<Player[]>('/players')
      .then((players) => setState({ status: 'ok', players }))
      .catch(() => setState({ status: 'error' }));
  }, []);

  const setPlayers = (change: (players: Player[]) => Player[]) =>
    setState((s) => (s.status === 'ok' ? { ...s, players: change(s.players).sort(byName) } : s));

  function explain(err: unknown) {
    const issues = err instanceof ApiError ? (err.body.issues as Issue[] | undefined) : undefined;
    setError(issues?.length ? issues.map((i) => issueMessage(t, i)).join(' ') : t.common.saveError);
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const player = await apiPost<Player>('/players', { name });
      setPlayers((players) => [...players, player]);
      setName('');
    } catch (err) {
      explain(err);
    }
  }

  async function rename(player: Player, value: string) {
    setError('');
    try {
      const saved = await apiPatch<Player>(`/players/${player.id}`, { name: value });
      setPlayers((players) => players.map((p) => (p.id === saved.id ? saved : p)));
    } catch (err) {
      explain(err);
    }
  }

  async function remove(player: Player) {
    if (!window.confirm(fill(t.playersPage.confirmDelete, { name: player.name }))) return;
    setError('');
    try {
      await apiDelete(`/players/${player.id}`);
      setPlayers((players) => players.filter((p) => p.id !== player.id));
    } catch (err) {
      explain(err);
    }
  }

  const query = search.trim().toLowerCase();
  const shown =
    state.status === 'ok' ? state.players.filter((p) => p.name.toLowerCase().includes(query)) : [];

  return (
    <article className="page">
      <h1>{t.playersPage.title}</h1>
      <p className="muted">{t.playersPage.hint}</p>

      <form className="inline-fields" onSubmit={add}>
        <label>
          {t.playersPage.newPlayer}
          <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="submit" disabled={!name.trim()}>
          {t.common.add}
        </button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {state.status === 'loading' && <p>{t.common.loading}</p>}
      {state.status === 'error' && <p className="error">{t.common.loadError}</p>}
      {state.status === 'ok' && state.players.length === 0 && (
        <p className="muted">{t.playersPage.empty}</p>
      )}
      {state.status === 'ok' && state.players.length > 0 && (
        <>
          <div className="view-toolbar">
            <label className="search">
              {t.playersPage.search}
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
            </label>
            <span className="muted">
              {fill(t.playersPage.count, { count: state.players.length })}
            </span>
          </div>
          <ul className="panel player-list">
            {shown.map((player) => (
              <li key={player.id}>
                <CommitInput
                  value={player.name}
                  maxLength={60}
                  aria-label={fill(t.playersPage.nameOf, { name: player.name })}
                  onCommit={(value) => rename(player, value)}
                />
                <button type="button" className="secondary danger" onClick={() => remove(player)}>
                  {t.playersPage.delete}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </article>
  );
}
