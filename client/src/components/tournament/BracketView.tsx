import { fill, useI18n } from '../../i18n/context';
import { sideGames } from '../../lib/score';
import {
  bracketName,
  bracketsCleared,
  knockoutMatchName,
  pairLabel,
  roundName,
  scheduleLabel,
  sideLabel,
  type Bracket,
  type Match,
  type Tournament,
} from '../../lib/tournaments';
import type { TournamentActions } from './actions';
import { CourtSelect, ResultInput, TimeSelect } from './MatchFields';

interface Props {
  tournament: Tournament;
  bracket: Bracket;
  /** Without actions the bracket is read-only (live view) */
  actions?: TournamentActions;
}

/** A bracket like the prototype: rounds in columns, then the champion. */
export function BracketView({ tournament, bracket, actions }: Props) {
  const { t } = useI18n();
  const matches = tournament.matches.filter((m) => m.bracket === bracket.id);
  const rounds = Array.from({ length: Math.log2(bracket.size) }, (_, round) =>
    matches.filter((m) => m.round === round).sort((a, b) => a.index! - b.index!),
  );

  const champion = bracket.champion
    ? pairLabel(tournament, bracket.champion)
    : fill(t.bracket.championOf, { bracket: bracketName(t, bracket.id) });
  const hint =
    bracket.id === 'C'
      ? t.bracket.consolationHint
      : tournament.groups.length > 0
        ? t.bracket.fromGroups
        : t.bracket.knockout;

  const cleared = bracketsCleared(tournament, bracket.id);
  const results = tournament.matches.filter(
    (m) => m.bracket && cleared.includes(m.bracket) && m.sets.length > 0,
  ).length;

  function resetBracket() {
    const message = fill(cleared.length > 1 ? t.bracket.confirmResetAll : t.bracket.confirmReset, {
      bracket: bracketName(t, bracket.id),
      count: results,
    });
    if (window.confirm(message)) actions!.resetBracket(bracket.id);
  }

  return (
    <section>
      <div className="view-title">
        <h2>{bracketName(t, bracket.id)}</h2>
        <p>{hint}</p>
      </div>
      {actions && results > 0 && (
        <div className="view-toolbar">
          <span />
          <button type="button" className="secondary" onClick={resetBracket}>
            {t.bracket.reset}
          </button>
        </div>
      )}
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
                    labelA={sideLabel(t, tournament, match, 'A')}
                    labelB={sideLabel(t, tournament, match, 'B')}
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
  actions?: TournamentActions;
}) {
  const { t } = useI18n();
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

  // A result that no longer counts is shown in the input only, not on the scoreboard
  const shown = match.state === 'done' ? match.sets : [];
  const side = (pairId: string | null, label: string, key: 'a' | 'b') => (
    <div className={`bm-row${match.winner && match.winner === pairId ? ' win' : ''}`}>
      <span className={`bm-name${pairId ? '' : ' placeholder'}`}>{label}</span>
      {sideGames(shown, key).map((set, i) => (
        <span key={i} className={`bm-set${set.won ? ' won' : ''}`}>
          {set.games}
          {set.tiebreak !== undefined && <sup>{set.tiebreak}</sup>}
        </span>
      ))}
    </div>
  );

  return (
    <div className={`bm state-${match.state}`} aria-label={name}>
      {side(match.pairA, labelA, 'a')}
      {side(match.pairB, labelB, 'b')}
      {actions ? (
        <MatchEditor tournament={tournament} match={match} name={name} actions={actions} />
      ) : (
        scheduleLabel(tournament, match) && (
          <div className="bm-meta muted">{scheduleLabel(tournament, match)}</div>
        )
      )}
    </div>
  );
}

/** Result, court and time of a bracket match, and what to do with a result that no longer counts. */
function MatchEditor({
  tournament,
  match,
  name,
  actions,
}: {
  tournament: Tournament;
  match: Match;
  name: string;
  actions: TournamentActions;
}) {
  const { t } = useI18n();
  const save = (changes: Parameters<TournamentActions['updateMatch']>[1]) =>
    actions.updateMatch(match.id, changes);
  const ready = Boolean(match.pairA && match.pairB);
  return (
    <>
      <div className="bm-meta">
        <ResultInput
          value={match.sets}
          format={tournament.matchFormat}
          label={fill(t.groups.resultOf, { match: name })}
          disabled={!ready && match.sets.length === 0}
          onSave={(sets) => save({ sets })}
          onUnreadable={actions.reportUnreadable}
        />
      </div>
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
          <button type="button" className="link" onClick={() => save({ sets: [] })}>
            {t.bracket.clear}
          </button>
        </div>
      )}
    </>
  );
}
