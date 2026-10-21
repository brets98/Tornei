import { fill, useI18n } from '../../i18n/context';
import { entriesLabel, isStructureLocked, LEVELS, type Tournament } from '../../lib/tournaments';
import type { TournamentActions } from './actions';
import { PlayerInputs } from './PlayerInputs';

interface Props {
  tournament: Tournament;
  actions: TournamentActions;
}

/** Knockout without groups: the entries in seed order, with their players. */
export function EntriesView({ tournament, actions }: Props) {
  const { t } = useI18n();
  const locked = isStructureLocked(tournament);
  // The consolation draw goes by level, which can change until the first result
  const byLevel = tournament.structure.type === 'knockout_consolation';

  function drawSeeding() {
    if (window.confirm(t.entriesView.confirmDraw)) actions.draw();
  }

  return (
    <section>
      <div className="view-title">
        <h2>{t.entriesView.title}</h2>
        <p>{byLevel ? t.entriesView.byLevel : t.entriesView.hint}</p>
      </div>
      <div className="view-toolbar">
        <p className="muted">
          {locked
            ? t.groups.locked
            : byLevel
              ? t.entriesView.levelsDraftHint
              : t.entriesView.draftHint}
        </p>
        {!locked && (
          <button type="button" className="secondary" onClick={drawSeeding}>
            {byLevel ? t.entriesView.redraw : t.groups.draw}
          </button>
        )}
      </div>
      <div className="panel pair-list entries">
        {tournament.seeding.map((pairId, i) => {
          const level = tournament.pairs.find((p) => p.id === pairId)?.level;
          return (
            <div key={pairId} className="pair-row">
              <span className="code">{i + 1}</span>
              <PlayerInputs
                tournament={tournament}
                pairId={pairId}
                onSave={(players) => actions.setPlayers(pairId, players)}
              />
              {level !== undefined && (
                <select
                  aria-label={fill(t.wizard.entryLevel, {
                    entry: entriesLabel(t, tournament.format).one,
                    n: i + 1,
                  })}
                  value={level}
                  disabled={locked}
                  onChange={(e) => actions.setLevel(pairId, Number(e.target.value))}
                >
                  {LEVELS.map((n) => (
                    <option key={n} value={n}>
                      {fill(t.wizard.level, { n })}
                    </option>
                  ))}
                </select>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
