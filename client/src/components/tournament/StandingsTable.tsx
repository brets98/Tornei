import { useI18n } from '../../i18n/context';
import { entriesLabel, pairLabel, type Group, type Tournament } from '../../lib/tournaments';

/** +3, 0, -2 */
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** A group's ranking, as computed and saved by the server; the leader is highlighted. */
export function StandingsTable({ tournament, group }: { tournament: Tournament; group: Group }) {
  const { t } = useI18n();
  return (
    <table className="standings">
      <thead>
        <tr>
          <th>{t.groups.pos}</th>
          <th>{entriesLabel(t, tournament.format).One}</th>
          <th title={t.groups.playedTitle}>{t.groups.played}</th>
          <th title={t.groups.winsTitle}>{t.groups.wins}</th>
          <th title={t.groups.setsTitle}>{t.groups.sets}</th>
          <th title={t.groups.gamesTitle}>{t.groups.games}</th>
        </tr>
      </thead>
      <tbody>
        {group.standings.map((row, i) => {
          return (
            <tr key={row.pairId} className={i === 0 && row.played > 0 ? 'leader' : undefined}>
              <td className="rank">{i + 1}</td>
              <td>{pairLabel(tournament, row.pairId)}</td>
              <td>{row.played}</td>
              <td>{row.wins}</td>
              <td>{signed(row.setsFor - row.setsAgainst)}</td>
              <td>{signed(row.gamesFor - row.gamesAgainst)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
