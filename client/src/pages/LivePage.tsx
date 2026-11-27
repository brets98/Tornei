import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { BracketView } from '../components/tournament/BracketView';
import { GroupsBoard } from '../components/tournament/GroupsBoard';
import { ScheduleBoard } from '../components/tournament/ScheduleBoard';
import { Freshness } from '../components/Freshness';
import { TournamentLogo } from '../components/tournament/Images';
import { fill, useI18n } from '../i18n/context';
import { ApiError, apiGet } from '../lib/api';
import {
  bracketName,
  formatDate,
  type Tournament,
  type TournamentListItem,
} from '../lib/tournaments';
import { useFullscreen } from '../lib/useFullscreen';

/** How often the shown tournament is loaded again. */
export const REFRESH_MS = 30 * 1000;

/**
 * `live`: groups and brackets, to follow a tournament; `organizers`: the matches by court and
 * time, for whoever runs it. Both read-only and reloaded every 30 seconds.
 */
export type LiveMode = 'live' | 'organizers';

/** One tournament to choose: name, sport, date, status and progress; opens it in this mode. */
function TournamentCard({ item, mode }: { item: TournamentListItem; mode: LiveMode }) {
  const { t } = useI18n();
  const { matchesDone, matchesTotal, status } = item.summary;
  return (
    <Link className="tournament-card" to={`/${mode}/${item.id}`}>
      <span className="eyebrow">{`${t.sport[item.sport]} · ${formatDate(item.date)}`}</span>
      <b>{item.name}</b>
      {item.subtitle && <span className="muted">{item.subtitle}</span>}
      <span className="card-foot">
        <span className={`badge status-${status}`}>{t.status[status]}</span>
        <span className="progress">
          <progress value={matchesDone} max={Math.max(matchesTotal, 1)} />
          <span>{fill(t.list.progressValue, { done: matchesDone, total: matchesTotal })}</span>
        </span>
      </span>
    </Link>
  );
}

/** 'groups' or 'bracket-A' / 'bracket-B'. */
type View = 'groups' | 'brackets';

/**
 * The groups or every bracket on one page, with a switch between them (kept in the address,
 * `?view=`; `bracket-A` from older links means the brackets). Until one is chosen it follows
 * the tournament: the groups while they are played, then the brackets.
 */
function Board({
  tournament,
  at,
  updated,
  mode,
}: {
  tournament: Tournament;
  at: Date;
  updated: string;
  mode: LiveMode;
}) {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const { ref, fullscreen, toggle } = useFullscreen<HTMLDivElement>();
  // Organizers see one view, the schedule: no switch
  const views: View[] =
    mode === 'organizers'
      ? []
      : [
          ...(tournament.groups.length > 0 ? ['groups' as const] : []),
          ...(tournament.brackets.length > 0 ? ['brackets' as const] : []),
        ];
  const param = searchParams.get('view');
  const requested = param?.startsWith('bracket-') ? 'brackets' : (param as View | null);
  const inKnockout = ['knockout', 'finished'].includes(tournament.summary.status);
  const view =
    requested && views.includes(requested)
      ? requested
      : (views.find((v) => (v === 'brackets') === inKnockout) ?? views[0]);
  // One bracket is named as such ('Bracket A'); more are 'Brackets'
  const bracketsLabel =
    tournament.brackets.length === 1 ? bracketName(t, tournament.brackets[0].id) : t.live.brackets;

  return (
    <div ref={ref} className={`live-board${fullscreen ? ' fullscreen' : ''}`}>
      <div className="live-toolbar">
        {fullscreen && (
          <div className="live-title">
            <b className="tournament-title">
              <TournamentLogo tournament={tournament} />
              {tournament.name}
            </b>
            <Freshness at={at} label={updated} />
          </div>
        )}
        {views.length > 1 && (
          <nav className="tabs live-switch" aria-label={t.live.switch}>
            {views.map((name) => (
              <button
                key={name}
                type="button"
                className={`tab${name === view ? ' active' : ''}`}
                aria-current={name === view ? 'page' : undefined}
                onClick={() => setSearchParams({ view: name }, { replace: true })}
              >
                {name === 'groups' ? t.groups.title : bracketsLabel}
              </button>
            ))}
          </nav>
        )}
        <button type="button" className="secondary fullscreen-toggle" onClick={toggle}>
          {fullscreen ? t.live.exitFullscreen : t.live.fullscreen}
        </button>
      </div>
      {mode === 'organizers' && <ScheduleBoard tournament={tournament} />}
      {view === 'groups' && (
        <section>
          <div className="view-title">
            <h2>{t.groups.title}</h2>
          </div>
          <GroupsBoard tournament={tournament} />
        </section>
      )}
      {view === 'brackets' && (
        <div className="live-brackets">
          {tournament.brackets.map((b) => (
            <BracketView key={b.id} tournament={tournament} bracket={b} />
          ))}
        </div>
      )}
    </div>
  );
}

/** What was loaded, for which tournament id: anything for another id means still loading. */
type Shown =
  | { id: string; status: 'notFound' }
  | { id: string; status: 'ok'; tournament: Tournament; at: Date; failed: boolean };

/**
 * Groups and brackets of one tournament, read-only, reloaded every 30 seconds: to follow a
 * tournament, e.g. on a screen at the club.
 */
export function LivePage({ mode = 'live' }: { mode?: LiveMode }) {
  const { id } = useParams();
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
  const updated =
    shown.status === 'ok'
      ? fill(t.live.updated, {
          time: shown.at.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
        })
      : '';

  return (
    <article className="page live-page">
      {/* A tournament speaks for itself: its name is the title, the cards page has this one */}
      {!id && (
        <div className="page-head">
          <h1>{mode === 'live' ? t.live.title : t.organizers.title}</h1>
        </div>
      )}

      {!id && list === null && <p>{t.common.loading}</p>}
      {!id && list?.length === 0 && <p className="muted">{t.list.empty}</p>}
      {!id && list && list.length > 0 && (
        <>
          <p className="muted">{mode === 'live' ? t.live.pick : t.organizers.pick}</p>
          {mode === 'organizers' && (
            <p>
              <Link className="button" to="/organizers/all">
                {t.organizers.all}
              </Link>
            </p>
          )}
          <ul className="tournament-cards">
            {list.map((item) => (
              <li key={item.id}>
                <TournamentCard item={item} mode={mode} />
              </li>
            ))}
          </ul>
        </>
      )}
      {id && shown.status === 'loading' && <p>{t.common.loading}</p>}
      {id && shown.status === 'notFound' && <p className="error">{t.tournament.notFound}</p>}
      {id && shown.status === 'ok' && (
        <>
          <header className="tournament-head">
            <div className="live-head-row">
              <div className="tournament-title">
                <TournamentLogo tournament={shown.tournament} />
                <h1>
                  {shown.tournament.name}
                  {shown.tournament.subtitle && <span>{shown.tournament.subtitle}</span>}
                </h1>
              </div>
              <div className="live-status">
                <Freshness at={shown.at} label={updated} />
                <button
                  type="button"
                  className="secondary icon-button"
                  aria-label={t.live.refresh}
                  title={t.live.refresh}
                  onClick={() => load()}
                >
                  ↻
                </button>
              </div>
            </div>
            {shown.failed && (
              <p className="error" role="alert">
                {t.live.refreshError}
              </p>
            )}
          </header>
          <Board tournament={shown.tournament} at={shown.at} updated={updated} mode={mode} />
        </>
      )}
    </article>
  );
}
