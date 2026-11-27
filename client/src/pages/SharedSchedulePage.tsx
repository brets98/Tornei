import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Freshness } from '../components/Freshness';
import { SharedScheduleBoard } from '../components/tournament/ScheduleBoard';
import { fill, useI18n } from '../i18n/context';
import { apiGet } from '../lib/api';
import { formatDate, type Tournament, type TournamentListItem } from '../lib/tournaments';
import { useFullscreen } from '../lib/useFullscreen';
import { REFRESH_MS } from './LivePage';

/** Today as 'YYYY-MM-DD', in local time. */
function today() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The day to show first: today if there is a tournament, else the next one, else the last. */
function defaultDate(dates: string[]) {
  const now = today();
  return dates.find((d) => d >= now) ?? dates.at(-1);
}

type Loaded = { date: string; tournaments: Tournament[]; at: Date; failed: boolean };

/**
 * Organizers: every tournament of one day in a single grid by court and time, to run several
 * tournaments on the same courts (`?date=`). Read-only, reloaded every 30 seconds. A first
 * step: clubs will later say which tournaments share courts.
 */
export function SharedSchedulePage() {
  const { t, locale } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const [list, setList] = useState<TournamentListItem[] | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const { ref, fullscreen, toggle } = useFullscreen<HTMLDivElement>();

  useEffect(() => {
    apiGet<TournamentListItem[]>('/tournaments')
      .then(setList)
      .catch(() => setList([]));
  }, []);

  const dates = [...new Set((list ?? []).map((item) => item.date))].sort();
  const requested = searchParams.get('date');
  const date = requested && dates.includes(requested) ? requested : defaultDate(dates);
  const ids = (list ?? []).filter((item) => item.date === date).map((item) => item.id);
  const idsKey = ids.join(',');

  // Loaded again every 30 seconds, and when ↻ bumps `reloads`
  const [reloads, setReloads] = useState(0);
  useEffect(() => {
    if (!date || !idsKey) return;
    let current = true;
    const load = () =>
      Promise.all(idsKey.split(',').map((id) => apiGet<Tournament>(`/tournaments/${id}`)))
        .then((tournaments) => {
          if (current) setLoaded({ date, tournaments, at: new Date(), failed: false });
        })
        .catch(() => {
          // Keep showing the last data; the next refresh tries again
          if (current) setLoaded((s) => (s && s.date === date ? { ...s, failed: true } : s));
        });
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [date, idsKey, reloads]);

  const shown = loaded && loaded.date === date ? loaded : null;
  const updated = shown
    ? fill(t.live.updated, {
        time: shown.at.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
      })
    : '';

  return (
    <article className="page live-page">
      <header className="tournament-head">
        <div className="live-head-row">
          <h1>{t.organizers.all}</h1>
          <div className="live-status">
            {dates.length > 0 && (
              <select
                aria-label={t.organizers.date}
                value={date}
                onChange={(e) => setSearchParams({ date: e.target.value }, { replace: true })}
              >
                {dates.map((d) => (
                  <option key={d} value={d}>
                    {formatDate(d)}
                  </option>
                ))}
              </select>
            )}
            {shown && <Freshness at={shown.at} label={updated} />}
            <button
              type="button"
              className="secondary icon-button"
              aria-label={t.live.refresh}
              title={t.live.refresh}
              onClick={() => setReloads((n) => n + 1)}
            >
              ↻
            </button>
          </div>
        </div>
        {shown?.failed && (
          <p className="error" role="alert">
            {t.live.refreshError}
          </p>
        )}
      </header>

      {list === null && <p>{t.common.loading}</p>}
      {list?.length === 0 && <p className="muted">{t.list.empty}</p>}
      {list && list.length > 0 && !shown && <p>{t.common.loading}</p>}
      {shown && (
        <div ref={ref} className={`live-board${fullscreen ? ' fullscreen' : ''}`}>
          <div className="live-toolbar">
            {fullscreen && (
              <div className="live-title">
                <b>{`${t.organizers.all} · ${formatDate(shown.date)}`}</b>
                <Freshness at={shown.at} label={updated} />
              </div>
            )}
            <span className="muted">
              {shown.tournaments.map((tournament) => tournament.name).join(' · ')}
            </span>
            <button type="button" className="secondary fullscreen-toggle" onClick={toggle}>
              {fullscreen ? t.live.exitFullscreen : t.live.fullscreen}
            </button>
          </div>
          <SharedScheduleBoard tournaments={shown.tournaments} />
        </div>
      )}
    </article>
  );
}
