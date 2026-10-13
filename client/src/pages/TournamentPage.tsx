import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { fill, it } from '../i18n/it';
import { ApiError, apiGet } from '../lib/api';
import { entriesLabel, formatDate, pairCode, pairLabel, type Tournament } from '../lib/tournaments';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; tournament: Tournament };

export function TournamentPage() {
  const { id } = useParams();
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    apiGet<Tournament>(`/tournaments/${id}`)
      .then((tournament) => setState({ status: 'ok', tournament }))
      .catch((err: unknown) =>
        setState({
          status: 'error',
          message:
            err instanceof ApiError && err.status === 404
              ? it.tournament.notFound
              : it.common.loadError,
        }),
      );
  }, [id]);

  if (state.status === 'loading') return <p className="page">{it.common.loading}</p>;
  if (state.status === 'error') return <p className="page error">{state.message}</p>;

  const t = state.tournament;
  return (
    <article className="tournament">
      <header className="tournament-head">
        <div className="eyebrow">{fill(it.tournament.eyebrow, { sport: it.sport[t.sport] })}</div>
        <h1>
          {t.name}
          {t.subtitle && <span>{t.subtitle}</span>}
        </h1>
        <div className="muted">{formatDate(t.date)}</div>
      </header>
      <nav className="tabs" aria-label={t.name}>
        <button type="button" className="tab active">
          {it.tournament.tabs.overview}
        </button>
      </nav>
      <Overview tournament={t} />
    </article>
  );
}

function Overview({ tournament: t }: { tournament: Tournament }) {
  const entries = entriesLabel(t.format);
  return (
    <section>
      <div className="view-title">
        <h2>{it.tournament.overviewTitle}</h2>
        <p>{it.tournament.overviewHint}</p>
      </div>
      <div className="stats">
        <Stat value={t.groups.length} label={it.tournament.stats.groups} />
        <Stat value={t.pairs.length} label={entries.Many} />
        <Stat
          value={`${t.summary.matchesDone}/${t.summary.matchesTotal}`}
          label={it.tournament.stats.matches}
        />
        <Stat value={t.courts.length} label={it.tournament.stats.courts} />
      </div>

      <div className="panels">
        <div className="panel">
          <h3>{t.groups.length > 0 ? it.tournament.stats.groups : it.tournament.seeding}</h3>
          {t.groups.length === 0 && (
            <ol>
              {t.seeding.map((pairId) => (
                <li key={pairId}>{pairLabel(t, pairId)}</li>
              ))}
            </ol>
          )}
          <div className="group-list">
            {t.groups.map((group) => (
              <div key={group.id}>
                <h4>{fill(it.tournament.group, { group: group.id })}</h4>
                <ul>
                  {group.pairIds.map((pairId) => (
                    <li key={pairId}>
                      <span className="code">{pairCode(t, pairId)}</span> {pairLabel(t, pairId)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <h3>{it.tournament.courts}</h3>
          <ol>
            {t.courts.map((court) => (
              <li key={court.id}>{court.name}</li>
            ))}
          </ol>
          <h3>{it.tournament.timeSlots}</h3>
          <p>{t.timeSlots.map((s) => s.time).join(' · ')}</p>
        </div>
      </div>
    </section>
  );
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="stat">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}
