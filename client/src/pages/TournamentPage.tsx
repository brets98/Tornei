import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import type { TournamentActions } from '../components/tournament/actions';
import { BracketView } from '../components/tournament/BracketView';
import { EntriesView } from '../components/tournament/EntriesView';
import { GroupsView } from '../components/tournament/GroupsView';
import { Overview } from '../components/tournament/Overview';
import { fill, useI18n } from '../i18n/context';
import { ApiError, apiGet, apiPatch, apiPost, apiPut } from '../lib/api';
import { formatDate, issueMessage, type Issue, type Tournament } from '../lib/tournaments';

type State =
  | { status: 'loading' }
  | { status: 'error'; notFound: boolean }
  | { status: 'ok'; tournament: Tournament };

type SaveState =
  | { status: 'idle' | 'saving' | 'saved' }
  | { status: 'error'; reason: 'conflict' | 'failed' }
  | { status: 'error'; reason: 'issues'; issues: Issue[] };

type Tab = 'overview' | 'groups' | 'entries' | `bracket-${string}`;

export function TournamentPage() {
  const { id } = useParams();
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' });
  // Saves run one after the other: each must see the previous one's result
  const queue = useRef<Promise<void>>(Promise.resolve());

  const load = useCallback(
    () =>
      apiGet<Tournament>(`/tournaments/${id}`)
        .then((tournament) => setState({ status: 'ok', tournament }))
        .catch((err: unknown) =>
          setState({ status: 'error', notFound: err instanceof ApiError && err.status === 404 }),
        ),
    [id],
  );

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Shows `optimistic` right away (if given), sends the change, then shows what the server
   * saved. If the change fails, reloads the tournament so the page shows the saved data.
   */
  const save = useCallback(
    (send: () => Promise<Tournament>, optimistic?: (t: Tournament) => Tournament) => {
      if (optimistic) {
        setState((s) => (s.status === 'ok' ? { ...s, tournament: optimistic(s.tournament) } : s));
      }
      setSaveState({ status: 'saving' });
      queue.current = queue.current.then(async () => {
        try {
          const tournament = await send();
          setState({ status: 'ok', tournament });
          setSaveState({ status: 'saved' });
        } catch (err) {
          const issues =
            err instanceof ApiError ? (err.body.issues as Issue[] | undefined) : undefined;
          if (issues?.length) setSaveState({ status: 'error', reason: 'issues', issues });
          else if (err instanceof ApiError && err.status === 409) {
            setSaveState({ status: 'error', reason: 'conflict' });
          } else setSaveState({ status: 'error', reason: 'failed' });
          await load();
        }
      });
    },
    [load],
  );

  const actions = useMemo<TournamentActions>(() => {
    const path = `/tournaments/${id}`;
    return {
      setPlayers: (pairId, players) =>
        save(
          () => apiPatch(`${path}/pairs/${pairId}`, { players }),
          (tournament) => ({
            ...tournament,
            pairs: tournament.pairs.map((p) => (p.id === pairId ? { ...p, players } : p)),
          }),
        ),
      updateMatch: (matchId, changes) =>
        save(
          () => apiPatch(`${path}/matches/${matchId}`, changes),
          (tournament) => ({
            ...tournament,
            matches: tournament.matches.map((m) => (m.id === matchId ? { ...m, ...changes } : m)),
          }),
        ),
      setGroups: (groups) => save(() => apiPut(`${path}/groups`, { groups })),
      draw: () => save(() => apiPost(`${path}/draw`)),
    };
  }, [id, save]);

  if (state.status === 'loading') return <p className="page">{t.common.loading}</p>;
  if (state.status === 'error') {
    return (
      <p className="page error">{state.notFound ? t.tournament.notFound : t.common.loadError}</p>
    );
  }

  const { tournament } = state;
  const tabs: Tab[] = [
    'overview',
    tournament.groups.length > 0 ? 'groups' : 'entries',
    ...tournament.brackets.map((b): Tab => `bracket-${b.id}`),
  ];
  const requested = searchParams.get('tab') as Tab | null;
  const tab = requested && tabs.includes(requested) ? requested : 'overview';
  const bracket = tournament.brackets.find((b) => tab === `bracket-${b.id}`);
  const stale = tournament.matches.filter((m) => m.state === 'stale');
  const tabLabel = (name: Tab) =>
    name.startsWith('bracket-')
      ? fill(t.tournament.tabs.bracket, { id: name.slice('bracket-'.length) })
      : t.tournament.tabs[name as Exclude<Tab, `bracket-${string}`>];

  return (
    <article className="tournament">
      <header className="tournament-head">
        <div className="eyebrow">
          {fill(t.tournament.eyebrow, { sport: t.sport[tournament.sport] })}
        </div>
        <h1>
          {tournament.name}
          {tournament.subtitle && <span>{tournament.subtitle}</span>}
        </h1>
        <div className="muted">{formatDate(tournament.date)}</div>
      </header>
      <nav className="tabs" aria-label={tournament.name}>
        {tabs.map((name) => (
          <button
            key={name}
            type="button"
            className={`tab${name === tab ? ' active' : ''}`}
            aria-current={name === tab ? 'page' : undefined}
            onClick={() => setSearchParams(name === 'overview' ? {} : { tab: name })}
          >
            {tabLabel(name)}
          </button>
        ))}
        <SaveStatus state={saveState} />
      </nav>

      {stale.length > 0 && (
        <p className="warning" role="alert">
          {fill(t.bracket.staleWarning, { count: stale.length })}
        </p>
      )}
      {tab === 'overview' && <Overview tournament={tournament} />}
      {tab === 'groups' && <GroupsView tournament={tournament} actions={actions} />}
      {tab === 'entries' && <EntriesView tournament={tournament} actions={actions} />}
      {bracket && <BracketView tournament={tournament} bracket={bracket} actions={actions} />}
    </article>
  );
}

function SaveStatus({ state }: { state: SaveState }) {
  const { t } = useI18n();
  if (state.status === 'idle') return null;
  if (state.status !== 'error') {
    return (
      <span className="save-status" role="status">
        {state.status === 'saving' ? t.common.saving : t.common.saved}
      </span>
    );
  }
  const message =
    state.reason === 'issues'
      ? state.issues.map((issue) => issueMessage(t, issue)).join(' ')
      : state.reason === 'conflict'
        ? t.common.conflict
        : t.common.saveError;
  return (
    <span className="save-status error" role="alert">
      {message}
    </span>
  );
}
