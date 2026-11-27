import { fill, useI18n } from '../../i18n/context';
import {
  entriesLabel,
  isStructureLocked,
  pairCode,
  pairLabel,
  type Group,
  type Tournament,
} from '../../lib/tournaments';
import type { TournamentActions } from './actions';
import { MatchRow } from './MatchRow';
import { PlayerInputs } from './PlayerInputs';
import { StandingsTable } from './StandingsTable';

interface Props {
  tournament: Tournament;
  actions: TournamentActions;
}

/** The group phase: one card per group with its pairs, matches and standings. */
export function GroupsView({ tournament, actions }: Props) {
  const { t } = useI18n();
  const locked = isStructureLocked(tournament);

  function drawGroups() {
    if (window.confirm(t.groups.confirmDraw)) actions.draw();
  }

  return (
    <section>
      <div className="view-title">
        <h2>{t.groups.title}</h2>
        <p>{t.groups.hint}</p>
      </div>
      <div className="view-toolbar">
        <p className="muted">{locked ? t.groups.locked : t.groups.draftHint}</p>
        {!locked && (
          <button type="button" className="secondary" onClick={drawGroups}>
            {t.groups.draw}
          </button>
        )}
      </div>
      <div className="groups-grid">
        {tournament.groups.map((group) => (
          <GroupCard
            key={group.id}
            tournament={tournament}
            group={group}
            locked={locked}
            actions={actions}
          />
        ))}
      </div>
    </section>
  );
}

function GroupCard({
  tournament,
  group,
  locked,
  actions,
}: Props & { group: Group; locked: boolean }) {
  const { t } = useI18n();
  const matches = tournament.matches.filter((m) => m.groupId === group.id);
  const canMove = !locked && tournament.groups.length > 1;
  // Entries can be added and removed until the knockout has a result
  const canEdit = !tournament.matches.some((m) => m.phase === 'knockout' && m.sets.length > 0);
  const entry = entriesLabel(t, tournament.format).one;

  function remove(pairId: string) {
    const results = matches.filter(
      (m) => (m.pairA === pairId || m.pairB === pairId) && m.sets.length > 0,
    ).length;
    const pair = pairLabel(tournament, pairId);
    const message = results
      ? fill(t.groups.confirmRemoveResults, { pair, count: results })
      : fill(t.groups.confirmRemove, { pair });
    if (window.confirm(message)) actions.removePair(pairId);
  }

  /** Moves a pair to the end of another group. */
  function move(pairId: string, toGroup: string) {
    actions.setGroups(
      tournament.groups.map((g) => ({
        id: g.id,
        pairIds:
          g.id === toGroup
            ? [...g.pairIds.filter((p) => p !== pairId), pairId]
            : g.pairIds.filter((p) => p !== pairId),
      })),
    );
  }

  return (
    <article className="group-card">
      <div className="group-head">
        <span>{fill(t.tournament.group, { group: group.id }).toUpperCase()}</span>
        <small>{t.groups.autoStandings}</small>
      </div>
      <div className="pair-list">
        {group.pairIds.map((pairId) => (
          <div key={pairId} className="pair-row">
            <span className="code">{pairCode(tournament, pairId)}</span>
            <PlayerInputs
              tournament={tournament}
              pairId={pairId}
              onSave={(players) => actions.setPlayers(pairId, players)}
            />
            {canMove && (
              <select
                className="mini-select"
                aria-label={fill(t.groups.groupOf, { pair: pairCode(tournament, pairId) })}
                value={group.id}
                onChange={(e) => move(pairId, e.target.value)}
              >
                {tournament.groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.id}
                  </option>
                ))}
              </select>
            )}
            {canEdit && (
              <button
                type="button"
                className="icon-button remove-entry"
                aria-label={fill(t.groups.removeEntry, { pair: pairLabel(tournament, pairId) })}
                title={fill(t.groups.removeEntry, { pair: pairLabel(tournament, pairId) })}
                onClick={() => remove(pairId)}
              >
                ×
              </button>
            )}
          </div>
        ))}
        {canEdit && (
          <button
            type="button"
            className="secondary add-entry"
            aria-label={fill(t.groups.addEntryTo, { entry, group: group.id })}
            onClick={() => actions.addPair(group.id)}
          >
            + {fill(t.groups.addEntry, { entry })}
          </button>
        )}
      </div>
      <div className="group-body">
        <h4>{t.groups.matches}</h4>
        <div className="table-wrap">
          <table className="matches">
            <thead>
              <tr>
                <th>{t.groups.match}</th>
                <th>{t.groups.score}</th>
                <th>{t.groups.court}</th>
                <th>{t.groups.time}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {matches.map((match) => (
                <MatchRow key={match.id} tournament={tournament} match={match} actions={actions} />
              ))}
            </tbody>
          </table>
        </div>
        <h4>{t.groups.standings}</h4>
        <StandingsTable tournament={tournament} group={group} />
      </div>
    </article>
  );
}
