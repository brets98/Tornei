import { useState } from 'react';
import { useI18n } from '../../i18n/context';
import { formatResult } from '../../lib/score';
import { matchPhase, sideLabel, type Match, type Tournament } from '../../lib/tournaments';

/** One match to show, with its tournament (named on the card when several are mixed). */
export interface ScheduleItem {
  tournament: Tournament;
  match: Match;
  /** On the same court at the same time as another match */
  clash: boolean;
}

/** One match in the grid: where it belongs, who plays, and the result once played. */
function ScheduleMatch({ item, withTournament }: { item: ScheduleItem; withTournament: boolean }) {
  const { t } = useI18n();
  const { tournament, match, clash } = item;
  const side = (s: 'A' | 'B') => {
    const pair = s === 'A' ? match.pairA : match.pairB;
    return (
      <span className={match.winner && match.winner === pair ? 'match-winner' : undefined}>
        {sideLabel(t, tournament, match, s)}
      </span>
    );
  };
  return (
    <div className={`schedule-match state-${match.state}${clash ? ' clash' : ''}`}>
      {withTournament && <span className="schedule-tournament">{tournament.name}</span>}
      <span className="schedule-phase">{matchPhase(t, tournament, match)}</span>
      <span className="schedule-sides">
        {side('A')}
        <span className="versus"> vs </span>
        {side('B')}
      </span>
      {match.state === 'done' && <b className="schedule-result">{formatResult(match.sets)}</b>}
      {clash && <span className="schedule-clash">{t.organizers.clash}</span>}
    </div>
  );
}

/** A grid cell's position: column (a court, or null for no court) and row (a time). */
export type Placed = ScheduleItem & { column: string | null; row: string };

/**
 * Matches by court and time: a column per court (and one for matches with a time but no
 * court), a row per time; matches without a time listed below, with their court if any.
 */
export function ScheduleGrid({
  columns,
  rows,
  placed,
  unscheduled,
  withTournament = false,
}: {
  columns: { key: string; name: string }[];
  /** Times in order, each with its label */
  rows: { key: string; time: string }[];
  placed: Placed[];
  unscheduled: (ScheduleItem & { court?: string })[];
  /** Several tournaments mixed: name each match's tournament */
  withTournament?: boolean;
}) {
  const { t } = useI18n();
  const allColumns = [
    ...columns,
    ...(placed.some((p) => p.column === null) ? [{ key: '', name: t.organizers.noCourt }] : []),
  ];
  const keyOf = (item: ScheduleItem) => `${item.tournament.id}:${item.match.id}`;

  return (
    <section className="schedule">
      {rows.length === 0 ? (
        <p className="muted">{t.organizers.noneScheduled}</p>
      ) : (
        <div className="panel schedule-wrap">
          <table className="schedule-grid">
            <thead>
              <tr>
                <th className="schedule-time">{t.groups.time}</th>
                {allColumns.map((c) => (
                  <th key={c.key}>{c.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <th scope="row" className="schedule-time">
                    {row.time}
                  </th>
                  {allColumns.map((c) => (
                    <td key={c.key}>
                      {placed
                        .filter((p) => p.row === row.key && (p.column ?? '') === c.key)
                        .map((p) => (
                          <ScheduleMatch key={keyOf(p)} item={p} withTournament={withTournament} />
                        ))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {unscheduled.length > 0 && (
        <div className="schedule-unscheduled">
          <h3>{t.organizers.unscheduled}</h3>
          <ul>
            {unscheduled.map((item) => (
              <li key={keyOf(item)}>
                <ScheduleMatch item={item} withTournament={withTournament} />
                {item.court && <span className="muted">{item.court}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Courts switched off in the shared view, by name (lowercase), saved in this browser. */
const HIDDEN_COURTS_KEY = 'tornei.organizers.hiddenCourts';

function hiddenCourtsBefore(): Set<string> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(HIDDEN_COURTS_KEY) ?? '[]');
    return new Set(Array.isArray(saved) ? saved.filter((k) => typeof k === 'string') : []);
  } catch {
    return new Set();
  }
}

/** One tournament's matches by court and time (byes left out). Read-only. */
export function ScheduleBoard({ tournament }: { tournament: Tournament }) {
  const matches = tournament.matches.filter((m) => m.state !== 'bye');
  const clashes = new Set(tournament.conflicts.flatMap((c) => c.matchIds));
  const item = (match: Match): ScheduleItem => ({
    tournament,
    match,
    clash: clashes.has(match.id),
  });
  const timed = matches.filter((m) => m.timeSlotId);
  return (
    <ScheduleGrid
      columns={tournament.courts.map((c) => ({ key: c.id, name: c.name }))}
      rows={tournament.timeSlots
        .filter((s) => timed.some((m) => m.timeSlotId === s.id))
        .map((s) => ({ key: s.id, time: s.time }))}
      placed={timed.map((m) => ({ ...item(m), column: m.courtId, row: m.timeSlotId! }))}
      unscheduled={matches
        .filter((m) => !m.timeSlotId)
        .map((m) => ({
          ...item(m),
          court: tournament.courts.find((c) => c.id === m.courtId)?.name,
        }))}
    />
  );
}

/**
 * Every tournament's matches in one grid, for a club running several at once: courts are
 * matched by name (ignoring case), times by their 'HH:MM'. Two matches on the same court at
 * the same time clash, also from different tournaments.
 */
export function SharedScheduleBoard({ tournaments }: { tournaments: Tournament[] }) {
  const { t } = useI18n();
  const [hidden, setHidden] = useState(hiddenCourtsBefore);
  const courtKey = (name: string) => name.trim().toLowerCase();
  const columns = new Map<string, string>();
  for (const tournament of tournaments) {
    for (const c of tournament.courts) {
      if (!columns.has(courtKey(c.name))) columns.set(courtKey(c.name), c.name);
    }
  }

  function toggle(key: string) {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setHidden(next);
    try {
      localStorage.setItem(HIDDEN_COURTS_KEY, JSON.stringify([...next]));
    } catch {
      // Not saved: the choice lasts until the page is reloaded
    }
  }

  const items = tournaments.flatMap((tournament) => {
    const own = new Set(tournament.conflicts.flatMap((c) => c.matchIds));
    return tournament.matches
      .filter((m) => m.state !== 'bye')
      .map((match) => ({
        tournament,
        match,
        clash: own.has(match.id),
        court: tournament.courts.find((c) => c.id === match.courtId)?.name,
        time: tournament.timeSlots.find((s) => s.id === match.timeSlotId)?.time,
      }));
  });

  // Clashes between tournaments: the same court (by name) at the same time
  const cell = (i: (typeof items)[number]) => `${courtKey(i.court!)}|${i.time}`;
  const inCell = new Map<string, number>();
  for (const i of items) if (i.court && i.time) inCell.set(cell(i), (inCell.get(cell(i)) ?? 0) + 1);

  // Switched-off courts are left out with their matches; matches with no court stay
  const shown = items.filter((i) => !i.court || !hidden.has(courtKey(i.court)));
  const timed = shown.filter((i) => i.time);
  const times = [...new Set(timed.map((i) => i.time!))].sort();
  return (
    <>
      <div className="court-chips" role="group" aria-label={t.organizers.courts}>
        {[...columns].map(([key, name]) => (
          <button
            key={key}
            type="button"
            className={`court-chip${hidden.has(key) ? '' : ' active'}`}
            aria-pressed={!hidden.has(key)}
            onClick={() => toggle(key)}
          >
            {name}
          </button>
        ))}
      </div>
      <ScheduleGrid
        withTournament
        columns={[...columns]
          .filter(([key]) => !hidden.has(key))
          .map(([key, name]) => ({ key, name }))}
        rows={times.map((time) => ({ key: time, time }))}
        placed={timed.map((i) => ({
          tournament: i.tournament,
          match: i.match,
          clash: i.clash || (i.court !== undefined && (inCell.get(cell(i)) ?? 0) > 1),
          column: i.court ? courtKey(i.court) : null,
          row: i.time!,
        }))}
        unscheduled={shown
          .filter((i) => !i.time)
          .map((i) => ({
            tournament: i.tournament,
            match: i.match,
            clash: i.clash,
            court: i.court,
          }))}
      />
    </>
  );
}
