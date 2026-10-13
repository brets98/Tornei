import { fill, useI18n } from '../../i18n/context';
import { formatResult } from '../../lib/score';
import { pairLabel, scheduleLabel, type Tournament } from '../../lib/tournaments';
import { StandingsTable } from './StandingsTable';

/** The groups, read-only: standings first, then each match with its result and schedule. */
export function GroupsBoard({ tournament }: { tournament: Tournament }) {
  const { t } = useI18n();
  return (
    <div className="groups-grid">
      {tournament.groups.map((group) => (
        <article
          key={group.id}
          className="group-card"
          aria-label={fill(t.tournament.group, { group: group.id })}
        >
          <div className="group-head">
            <span>{fill(t.tournament.group, { group: group.id }).toUpperCase()}</span>
            {group.complete && <small>{t.live.complete}</small>}
          </div>
          <div className="group-body">
            <h4>{t.groups.standings}</h4>
            <StandingsTable tournament={tournament} group={group} />
            <h4>{t.groups.matches}</h4>
            <div className="table-wrap">
              <table className="matches">
                <tbody>
                  {tournament.matches
                    .filter((m) => m.groupId === group.id)
                    .map((match) => (
                      <tr key={match.id} className={`match state-${match.state}`}>
                        <td>
                          <span
                            className={match.winner === match.pairA ? 'match-winner' : undefined}
                          >
                            {pairLabel(tournament, match.pairA!)}
                          </span>
                          <span className="versus"> vs </span>
                          <span
                            className={match.winner === match.pairB ? 'match-winner' : undefined}
                          >
                            {pairLabel(tournament, match.pairB!)}
                          </span>
                        </td>
                        <td className="nowrap">
                          {match.state === 'done' ? formatResult(match.sets) : ''}
                        </td>
                        <td className="nowrap muted">
                          {match.state === 'done' ? '' : scheduleLabel(tournament, match)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
