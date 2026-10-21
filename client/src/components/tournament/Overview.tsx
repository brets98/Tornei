import { useState } from 'react';
import { fill, useI18n } from '../../i18n/context';
import type { Messages } from '../../i18n/en';
import { formatResult } from '../../lib/score';
import {
  bracketName,
  entriesLabel,
  matchFormatName,
  matchPhase,
  pairCode,
  pairLabel,
  sideLabel,
  type Conflict,
  type Match,
  type Tournament,
} from '../../lib/tournaments';
import type { TournamentActions } from './actions';
import { CourtSelect, TimeSelect } from './MatchFields';

/** 'all', 'none' (not scheduled) or an id. */
type Filter = string;

/** Dashboard of a tournament: stats, conflicts, every match, groups, courts, times. */
export function Overview({
  tournament,
  actions,
}: {
  tournament: Tournament;
  actions: TournamentActions;
}) {
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

      {tournament.conflicts.length > 0 && (
        <div className="warning" role="alert">
          <b>{t.overview.conflicts}</b>
          <ul>
            {tournament.conflicts.map((conflict) => (
              <li
                key={`${conflict.kind}-${conflict.timeSlotId}-${conflict.courtId ?? conflict.pairId}`}
              >
                {conflictMessage(t, tournament, conflict)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <MatchList tournament={tournament} actions={actions} />

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
          <h3>{t.wizard.matchFormat}</h3>
          <p>{matchFormatName(t, tournament.matchFormat)}</p>
        </div>
      </div>
    </section>
  );
}

/** 'Girone A (Rossi / Bianchi – A2)' */
function matchDescription(t: Messages, tournament: Tournament, match: Match) {
  return `${matchPhase(t, tournament, match)} (${sideLabel(t, tournament, match, 'A')} – ${sideLabel(t, tournament, match, 'B')})`;
}

function conflictMessage(t: Messages, tournament: Tournament, conflict: Conflict) {
  const time = tournament.timeSlots.find((s) => s.id === conflict.timeSlotId)?.time ?? '';
  const matches = conflict.matchIds
    .map((id) => tournament.matches.find((m) => m.id === id))
    .filter((m): m is Match => Boolean(m))
    .map((m) => matchDescription(t, tournament, m))
    .join(', ');
  if (conflict.kind === 'court') {
    const court = tournament.courts.find((c) => c.id === conflict.courtId)?.name ?? '';
    return fill(t.overview.courtConflict, { court, time, matches });
  }
  return fill(t.overview.pairConflict, {
    pair: pairLabel(tournament, conflict.pairId!),
    count: conflict.matchIds.length,
    time,
    matches,
  });
}

function MatchList({
  tournament,
  actions,
}: {
  tournament: Tournament;
  actions: TournamentActions;
}) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Filter>('all');
  const [court, setCourt] = useState<Filter>('all');
  const [time, setTime] = useState<Filter>('all');

  const slotIndex = (m: Match) => {
    const index = tournament.timeSlots.findIndex((s) => s.id === m.timeSlotId);
    return index === -1 ? Infinity : index;
  };
  const courtIndex = (m: Match) => {
    const index = tournament.courts.findIndex((c) => c.id === m.courtId);
    return index === -1 ? Infinity : index;
  };
  const matches = tournament.matches.filter((m) => m.state !== 'bye');
  const matching = (value: string | null, filter: Filter) =>
    filter === 'all' || (filter === 'none' ? value === null : value === filter);
  const shown = matches
    .filter(
      (m) =>
        (phase === 'all' || (phase === 'groups' ? m.phase === 'group' : m.bracket === phase)) &&
        matching(m.courtId, court) &&
        matching(m.timeSlotId, time),
    )
    // In schedule order; matches without a time last, in their usual order
    .map((m, order) => ({ m, order }))
    .sort(
      (a, b) =>
        slotIndex(a.m) - slotIndex(b.m) || courtIndex(a.m) - courtIndex(b.m) || a.order - b.order,
    )
    .map(({ m }) => m);
  const inConflict = new Set(tournament.conflicts.flatMap((c) => c.matchIds));

  return (
    <div className="panel match-list">
      <h3>{t.overview.matches}</h3>
      <div className="filters">
        <select
          aria-label={t.overview.phase}
          value={phase}
          onChange={(e) => setPhase(e.target.value)}
        >
          <option value="all">{t.overview.allPhases}</option>
          {tournament.groups.length > 0 && <option value="groups">{t.overview.groupsPhase}</option>}
          {tournament.brackets.map((b) => (
            <option key={b.id} value={b.id}>
              {bracketName(t, b.id)}
            </option>
          ))}
        </select>
        <select
          aria-label={t.groups.court}
          value={court}
          onChange={(e) => setCourt(e.target.value)}
        >
          <option value="all">{t.overview.allCourts}</option>
          <option value="none">{t.overview.noCourt}</option>
          {tournament.courts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select aria-label={t.groups.time} value={time} onChange={(e) => setTime(e.target.value)}>
          <option value="all">{t.overview.allTimes}</option>
          <option value="none">{t.overview.noTime}</option>
          {tournament.timeSlots.map((s) => (
            <option key={s.id} value={s.id}>
              {s.time}
            </option>
          ))}
        </select>
        <span className="muted">
          {fill(t.overview.shown, { count: shown.length, total: matches.length })}
        </span>
      </div>
      {shown.length === 0 ? (
        <p className="muted">{t.overview.noMatches}</p>
      ) : (
        <div className="table-wrap">
          <table className="matches">
            <thead>
              <tr>
                <th>{t.overview.phase}</th>
                <th>{t.groups.match}</th>
                <th>{t.groups.score}</th>
                <th>{t.groups.court}</th>
                <th>{t.groups.time}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((match) => {
                const name = matchDescription(t, tournament, match);
                const side = (key: 'A' | 'B') => {
                  const pairId = key === 'A' ? match.pairA : match.pairB;
                  return (
                    <span
                      className={
                        pairId && match.winner === pairId
                          ? 'match-winner'
                          : pairId
                            ? undefined
                            : 'placeholder'
                      }
                    >
                      {sideLabel(t, tournament, match, key)}
                    </span>
                  );
                };
                return (
                  <tr
                    key={match.id}
                    className={`match state-${match.state}${inConflict.has(match.id) ? ' conflict' : ''}`}
                  >
                    <td className="nowrap">
                      {inConflict.has(match.id) && (
                        <span
                          className="conflict-mark"
                          title={t.overview.conflictMark}
                          role="img"
                          aria-label={t.overview.conflictMark}
                        >
                          ⚠{' '}
                        </span>
                      )}
                      {matchPhase(t, tournament, match)}
                    </td>
                    <td>
                      {side('A')}
                      <span className="versus"> vs </span>
                      {side('B')}
                    </td>
                    <td className="nowrap">{formatResult(match.sets)}</td>
                    <td>
                      <CourtSelect
                        tournament={tournament}
                        value={match.courtId}
                        label={fill(t.groups.courtOf, { match: name })}
                        onSave={(courtId) => actions.updateMatch(match.id, { courtId })}
                      />
                    </td>
                    <td>
                      <TimeSelect
                        tournament={tournament}
                        value={match.timeSlotId}
                        label={fill(t.groups.timeOf, { match: name })}
                        onSave={(timeSlotId) => actions.updateMatch(match.id, { timeSlotId })}
                      />
                    </td>
                    <td>
                      <span className={`match-state ${match.state}`}>
                        {t.matchState[match.state]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
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
