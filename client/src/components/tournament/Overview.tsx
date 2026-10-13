import { fill, useI18n } from '../../i18n/context';
import { entriesLabel, pairCode, pairLabel, type Tournament } from '../../lib/tournaments';

/** Dashboard of a tournament: stats, groups, courts and time slots. */
export function Overview({ tournament }: { tournament: Tournament }) {
  const { t } = useI18n();
  const entries = entriesLabel(t, tournament.format);
  return (
    <section>
      <div className="view-title">
        <h2>{t.tournament.overviewTitle}</h2>
        <p>{t.tournament.overviewHint}</p>
      </div>
      <div className="stats">
        <Stat value={tournament.groups.length} label={t.tournament.stats.groups} />
        <Stat value={tournament.pairs.length} label={entries.Many} />
        <Stat
          value={`${tournament.summary.matchesDone}/${tournament.summary.matchesTotal}`}
          label={t.tournament.stats.matches}
        />
        <Stat value={tournament.courts.length} label={t.tournament.stats.courts} />
      </div>

      <div className="panels">
        <div className="panel">
          <h3>{tournament.groups.length > 0 ? t.tournament.stats.groups : t.tournament.seeding}</h3>
          {tournament.groups.length === 0 && (
            <ol>
              {tournament.seeding.map((pairId) => (
                <li key={pairId}>{pairLabel(tournament, pairId)}</li>
              ))}
            </ol>
          )}
          <div className="group-list">
            {tournament.groups.map((group) => (
              <div key={group.id}>
                <h4>{fill(t.tournament.group, { group: group.id })}</h4>
                <ul>
                  {group.pairIds.map((pairId) => (
                    <li key={pairId}>
                      <span className="code">{pairCode(tournament, pairId)}</span>{' '}
                      {pairLabel(tournament, pairId)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <h3>{t.tournament.courts}</h3>
          <ol>
            {tournament.courts.map((court) => (
              <li key={court.id}>{court.name}</li>
            ))}
          </ol>
          <h3>{t.tournament.timeSlots}</h3>
          <p>{tournament.timeSlots.map((s) => s.time).join(' · ')}</p>
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
