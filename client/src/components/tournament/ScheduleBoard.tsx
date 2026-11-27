import { useI18n } from '../../i18n/context';
import { formatResult } from '../../lib/score';
import { matchPhase, sideLabel, type Match, type Tournament } from '../../lib/tournaments';

/** One match in the grid: where it belongs, who plays, and the result once played. */
function ScheduleMatch({
  tournament,
  match,
  clash,
}: {
  tournament: Tournament;
  match: Match;
  clash: boolean;
}) {
  const { t } = useI18n();
  const side = (s: 'A' | 'B') => (
    <span
      className={
        match.winner && match.winner === (s === 'A' ? match.pairA : match.pairB)
          ? 'match-winner'
          : undefined
      }
    >
      {sideLabel(t, tournament, match, s)}
    </span>
  );
  return (
    <div className={`schedule-match state-${match.state}${clash ? ' clash' : ''}`}>
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

/**
 * The matches by court and time: a column per court (and one for matches with a time but no
 * court), a row per time with matches; matches without a time are listed below. Byes are left
 * out. Read-only, for whoever runs the tournament.
 */
export function ScheduleBoard({ tournament }: { tournament: Tournament }) {
  const { t } = useI18n();
  const matches = tournament.matches.filter((m) => m.state !== 'bye');
  const clashes = new Set(tournament.conflicts.flatMap((c) => c.matchIds));
  const timed = matches.filter((m) => m.timeSlotId);
  const slots = tournament.timeSlots.filter((s) => timed.some((m) => m.timeSlotId === s.id));
  const withoutCourt = timed.some((m) => !m.courtId);
  const columns: { id: string | null; name: string }[] = [
    ...tournament.courts.map((c) => ({ id: c.id, name: c.name })),
    ...(withoutCourt ? [{ id: null, name: t.organizers.noCourt }] : []),
  ];
  const unscheduled = matches.filter((m) => !m.timeSlotId);
  const courtName = (id: string | null) => tournament.courts.find((c) => c.id === id)?.name;

  return (
    <section className="schedule">
      {slots.length === 0 ? (
        <p className="muted">{t.organizers.noneScheduled}</p>
      ) : (
        <div className="panel schedule-wrap">
          <table className="schedule-grid">
            <thead>
              <tr>
                <th className="schedule-time">{t.groups.time}</th>
                {columns.map((c) => (
                  <th key={c.id ?? 'none'}>{c.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slots.map((slot) => {
                const inSlot = timed.filter((m) => m.timeSlotId === slot.id);
                return (
                  <tr key={slot.id}>
                    <th scope="row" className="schedule-time">
                      {slot.time}
                    </th>
                    {columns.map((c) => (
                      <td key={c.id ?? 'none'}>
                        {inSlot
                          .filter((m) => m.courtId === c.id)
                          .map((m) => (
                            <ScheduleMatch
                              key={m.id}
                              tournament={tournament}
                              match={m}
                              clash={clashes.has(m.id)}
                            />
                          ))}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {unscheduled.length > 0 && (
        <div className="schedule-unscheduled">
          <h3>{t.organizers.unscheduled}</h3>
          <ul>
            {unscheduled.map((m) => (
              <li key={m.id}>
                <ScheduleMatch tournament={tournament} match={m} clash={false} />
                {m.courtId && <span className="muted">{courtName(m.courtId)}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
