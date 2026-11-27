import { useEffect, useState } from 'react';
import { Freshness } from '../components/Freshness';
import { BracketView } from '../components/tournament/BracketView';
import { GroupsBoard } from '../components/tournament/GroupsBoard';
import { TournamentLogo } from '../components/tournament/Images';
import { fill, useI18n } from '../i18n/context';
import { apiGet } from '../lib/api';
import { bracketName, type Tournament, type TournamentListItem } from '../lib/tournaments';
import { activeSlides, type Slide } from '../lib/live';
import { useFullscreen } from '../lib/useFullscreen';
import { REFRESH_MS } from './LivePage';

/** How long each phase stays on screen before the next one. */
export const ROTATE_MS = 30 * 1000;

type Loaded = { tournaments: Tournament[]; at: Date; failed: boolean };

/**
 * Live view, "General": every tournament under way, one phase at a time, moving on every 30
 * seconds (paused, or moved by hand, with the controls). For a screen at the club. Read-only,
 * reloaded every 30 seconds: tournaments that start or finish come and go by themselves.
 */
export function GeneralLivePage() {
  const { t, locale } = useI18n();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [reloads, setReloads] = useState(0);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const { ref, fullscreen, toggle } = useFullscreen<HTMLDivElement>();

  useEffect(() => {
    let current = true;
    const load = () =>
      apiGet<TournamentListItem[]>('/tournaments')
        .then((list) =>
          Promise.all(
            list
              .filter((item) => ['groups', 'knockout'].includes(item.summary.status))
              .map((item) => apiGet<Tournament>(`/tournaments/${item.id}`)),
          ),
        )
        .then((tournaments) => {
          if (current) setLoaded({ tournaments, at: new Date(), failed: false });
        })
        .catch(() => {
          // Keep showing the last data; the next refresh tries again
          if (current) setLoaded((s) => (s ? { ...s, failed: true } : s));
        });
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [reloads]);

  const slides = loaded ? activeSlides(loaded.tournaments) : [];
  const count = slides.length;
  const position = count > 0 ? index % count : 0;
  const slide = slides[position];

  useEffect(() => {
    if (!playing || count < 2) return;
    const timer = setInterval(() => setIndex((i) => i + 1), ROTATE_MS);
    return () => clearInterval(timer);
  }, [playing, count]);

  const move = (step: number) => setIndex((position + step + count) % count);
  const updated = loaded
    ? fill(t.live.updated, {
        time: loaded.at.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
      })
    : '';
  const phase = (s: Slide) => (s.bracket ? bracketName(t, s.bracket) : t.groups.title);

  return (
    <article className="page live-page">
      <header className="tournament-head">
        <div className="live-head-row">
          <h1>{t.live.general}</h1>
          <div className="live-status">
            {loaded && <Freshness at={loaded.at} label={updated} />}
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
        {loaded?.failed && (
          <p className="error" role="alert">
            {t.live.refreshError}
          </p>
        )}
      </header>

      {!loaded && <p>{t.common.loading}</p>}
      {loaded && count === 0 && <p className="muted">{t.live.noneActive}</p>}
      {slide && (
        <div ref={ref} className={`live-board${fullscreen ? ' fullscreen' : ''}`}>
          <div className="live-toolbar">
            <div className="live-title">
              <b className="tournament-title">
                <TournamentLogo tournament={slide.tournament} />
                {slide.tournament.name}
              </b>
              <span className="badge">{phase(slide)}</span>
              {fullscreen && <Freshness at={loaded!.at} label={updated} />}
            </div>
            {count > 1 && (
              <div className="slide-controls" role="group" aria-label={t.live.rotation}>
                <button
                  type="button"
                  className="secondary icon-button"
                  aria-label={t.live.previous}
                  title={t.live.previous}
                  onClick={() => move(-1)}
                >
                  ‹
                </button>
                <span className="muted">
                  {fill(t.live.position, { n: position + 1, total: count })}
                </span>
                <button
                  type="button"
                  className="secondary icon-button"
                  aria-label={playing ? t.live.pause : t.live.play}
                  title={playing ? t.live.pause : t.live.play}
                  onClick={() => setPlaying((p) => !p)}
                >
                  {playing ? '❚❚' : '▶'}
                </button>
                <button
                  type="button"
                  className="secondary icon-button"
                  aria-label={t.live.next}
                  title={t.live.next}
                  onClick={() => move(1)}
                >
                  ›
                </button>
              </div>
            )}
            <button type="button" className="secondary fullscreen-toggle" onClick={toggle}>
              {fullscreen ? t.live.exitFullscreen : t.live.fullscreen}
            </button>
          </div>
          {count > 1 && (
            <ol className="slide-dots" aria-hidden="true">
              {slides.map((s, i) => (
                <li
                  key={`${s.tournament.id}:${s.bracket ?? 'groups'}`}
                  className={i === position ? 'active' : undefined}
                  title={`${s.tournament.name} · ${phase(s)}`}
                />
              ))}
            </ol>
          )}
          {slide.bracket === null ? (
            <section aria-label={`${slide.tournament.name} · ${phase(slide)}`}>
              <GroupsBoard tournament={slide.tournament} />
            </section>
          ) : (
            <div className="live-brackets">
              <BracketView
                tournament={slide.tournament}
                bracket={slide.tournament.brackets.find((b) => b.id === slide.bracket)!}
              />
            </div>
          )}
        </div>
      )}
    </article>
  );
}
