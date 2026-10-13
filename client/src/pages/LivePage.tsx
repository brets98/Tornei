import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { BracketView } from '../components/tournament/BracketView';
import { GroupsBoard } from '../components/tournament/GroupsBoard';
import { fill, useI18n } from '../i18n/context';
import { ApiError, apiGet } from '../lib/api';
import { formatDate, type Tournament, type TournamentListItem } from '../lib/tournaments';

/** How often the shown tournament is loaded again. */
export const REFRESH_MS = 2 * 60 * 1000;

/** What was loaded, for which tournament id: anything for another id means still loading. */
type Shown =
  | { id: string; status: 'notFound' }
  | { id: string; status: 'ok'; tournament: Tournament; at: Date; failed: boolean };

/**
 * Groups and brackets of one tournament, read-only, reloaded every 2 minutes: to follow a
 * tournament, e.g. on a screen at the club.
 */
export function LivePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, locale } = useI18n();
  const [list, setList] = useState<TournamentListItem[] | null>(null);
  const [loaded, setLoaded] = useState<Shown | null>(null);

  useEffect(() => {
    apiGet<TournamentListItem[]>('/tournaments')
      .then(setList)
      .catch(() => setList([]));
  }, []);

  const load = useCallback(
    (isCurrent: () => boolean = () => true) =>
      apiGet<Tournament>(`/tournaments/${id}`)
        .then((tournament) => {
          if (isCurrent()) {
            setLoaded({ id: id!, status: 'ok', tournament, at: new Date(), failed: false });
          }
        })
        .catch((err: unknown) => {
          if (!isCurrent()) return;
          if (err instanceof ApiError && err.status === 404) {
            setLoaded({ id: id!, status: 'notFound' });
            return;
          }
          // Keep showing the last data; the next refresh tries again
          setLoaded((s): Shown =>
            s && s.id === id && s.status === 'ok'
              ? { ...s, failed: true }
              : { id: id!, status: 'notFound' },
          );
        }),
    [id],
  );

  useEffect(() => {
    if (!id) return;
    let current = true;
    load(() => current);
    const timer = setInterval(() => load(() => current), REFRESH_MS);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [id, load]);

  const shown = loaded && loaded.id === id ? loaded : { status: 'loading' as const };

  return (
    <article className="page wide live">
      <div className="page-head">
        <h1>{t.live.title}</h1>
        <label className="inline">
          {t.live.choose}
          <select value={id ?? ''} onChange={(e) => navigate(`/live/${e.target.value}`)}>
            <option value="" disabled>
              {t.live.placeholder}
            </option>
            {list?.map((item) => (
              <option key={item.id} value={item.id}>
                {`${item.name} · ${formatDate(item.date)}`}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!id && <p className="muted">{list?.length === 0 ? t.list.empty : t.live.pick}</p>}
      {id && shown.status === 'loading' && <p>{t.common.loading}</p>}
      {id && shown.status === 'notFound' && <p className="error">{t.tournament.notFound}</p>}
      {id && shown.status === 'ok' && (
        <>
          <header className="tournament-head">
            <div className="eyebrow">
              {fill(t.tournament.eyebrow, { sport: t.sport[shown.tournament.sport] })}
            </div>
            <h2>
              {shown.tournament.name}
              {shown.tournament.subtitle && <span>{shown.tournament.subtitle}</span>}
            </h2>
            <div className="live-status">
              <span className="muted" role="status">
                {fill(t.live.updated, {
                  time: shown.at.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
                })}
              </span>
              <button type="button" className="secondary" onClick={() => load()}>
                {t.live.refresh}
              </button>
            </div>
            {shown.failed && (
              <p className="error" role="alert">
                {t.live.refreshError}
              </p>
            )}
          </header>
          {shown.tournament.groups.length > 0 && (
            <section>
              <div className="view-title">
                <h2>{t.groups.title}</h2>
              </div>
              <GroupsBoard tournament={shown.tournament} />
            </section>
          )}
          {shown.tournament.brackets.map((bracket) => (
            <BracketView key={bracket.id} tournament={shown.tournament} bracket={bracket} />
          ))}
        </>
      )}
    </article>
  );
}
