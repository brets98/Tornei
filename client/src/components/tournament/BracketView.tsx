import { fill, useI18n } from '../../i18n/context';
import {
  knockoutMatchName,
  pairLabel,
  roundName,
  type Bracket,
  type Match,
  type Source,
  type Tournament,
} from '../../lib/tournaments';
import type { TournamentActions } from './actions';
import { CourtSelect, ScoreInput, TimeSelect } from './MatchFields';

interface Props {
  tournament: Tournament;
  bracket: Bracket;
  actions: TournamentActions;
}

/** A bracket like the prototype: rounds in columns, then the champion. */
export function BracketView({ tournament, bracket, actions }: Props) {
  const { t } = useI18n();
  const matches = tournament.matches.filter((m) => m.bracket === bracket.id);
  const rounds = Array.from({ length: Math.log2(bracket.size) }, (_, round) =>
    matches.filter((m) => m.round === round).sort((a, b) => a.index! - b.index!),
  );
  const byId = new Map(matches.map((m) => [m.id, m]));

  /** Who plays a side: the pair once known, otherwise where it will come from. */
  function sideLabel(pairId: string | null, source: Source | undefined) {
    if (pairId) return pairLabel(tournament, pairId);
    switch (source?.kind) {
      case 'group':
        return fill(t.bracket.groupPosition, { group: source.groupId, position: source.position });
      case 'seed':
        return fill(t.bracket.seed, { n: source.index + 1 });
      case 'winner': {
        const from = byId.get(source.matchId);
        return from
          ? fill(t.bracket.winnerOf, { match: knockoutMatchName(t, bracket, from) })
          : '—';
      }
      default:
        return t.bracket.bye;
    }
  }

  const champion = bracket.champion
    ? pairLabel(tournament, bracket.champion)
    : fill(t.bracket.championOf, { id: bracket.id });

  return (
    <section>
      <div className="view-title">
        <h2>{fill(t.bracket.title, { id: bracket.id })}</h2>
        <p>{tournament.groups.length > 0 ? t.bracket.fromGroups : t.bracket.knockout}</p>
      </div>
      <div className="panel bracket-wrap">
        <div
          className="bracket"
          style={{ gridTemplateColumns: `repeat(${rounds.length + 1}, minmax(15rem, 1fr))` }}
        >
          {rounds.map((roundMatches, round) => (
            <div key={round} className="round-column">
              <div className="round-title">{roundName(t, roundMatches.length, round)}</div>
              <div className="round">
                {roundMatches.map((match) => (
                  <BracketMatch
                    key={match.id}
                    tournament={tournament}
                    match={match}
                    name={knockoutMatchName(t, bracket, match)}
                    labelA={sideLabel(match.pairA, match.sourceA)}
                    labelB={sideLabel(match.pairB, match.sourceB)}
                    actions={actions}
                  />
                ))}
              </div>
            </div>
          ))}
          <div className="round-column">
            <div className="round-title">{t.bracket.champion}</div>
            <div className="round">
              <div className={`champion${bracket.champion ? ' decided' : ''}`}>
                <b>{t.bracket.champion.toUpperCase()}</b>
                {champion}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function BracketMatch({
  tournament,
  match,
  name,
  labelA,
  labelB,
  actions,
}: {
  tournament: Tournament;
  match: Match;
  name: string;
  labelA: string;
  labelB: string;
  actions: TournamentActions;
}) {
  const { t } = useI18n();
  const save = (changes: Parameters<TournamentActions['updateMatch']>[1]) =>
    actions.updateMatch(match.id, changes);

  if (match.state === 'bye') {
    return (
      <div className="bm bye" aria-label={name}>
        <div className="bm-row">
          <span className="bm-name">{match.pairA ? labelA : labelB}</span>
        </div>
        <div className="bm-row muted">{t.bracket.bye}</div>
      </div>
    );
  }

  const ready = Boolean(match.pairA && match.pairB);
  const side = (pairId: string | null, label: string, key: 'scoreA' | 'scoreB') => (
    <div className={`bm-row${match.winner && match.winner === pairId ? ' win' : ''}`}>
      <span className={`bm-name${pairId ? '' : ' placeholder'}`}>{label}</span>
      <ScoreInput
        value={match[key]}
        label={fill(t.groups.scoreOf, { pair: label })}
        disabled={!ready}
        onSave={(score) => save({ [key]: score })}
      />
    </div>
  );

  return (
    <div className={`bm state-${match.state}`} aria-label={name}>
      {side(match.pairA, labelA, 'scoreA')}
      {side(match.pairB, labelB, 'scoreB')}
      <div className="bm-meta">
        <CourtSelect
          tournament={tournament}
          value={match.courtId}
          label={fill(t.groups.courtOf, { match: name })}
          onSave={(courtId) => save({ courtId })}
        />
        <TimeSelect
          tournament={tournament}
          value={match.timeSlotId}
          label={fill(t.groups.timeOf, { match: name })}
          onSave={(timeSlotId) => save({ timeSlotId })}
        />
      </div>
      {match.state === 'invalid' && <p className="bm-note error">{t.matchState.invalid}</p>}
      {match.state === 'stale' && (
        <div className="bm-note error" role="alert">
          {t.bracket.stale}{' '}
          <button
            type="button"
            className="link"
            onClick={() => save({ scoreA: null, scoreB: null })}
          >
            {t.bracket.clear}
          </button>
        </div>
      )}
    </div>
  );
}
