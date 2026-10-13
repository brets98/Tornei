import { useI18n } from '../../i18n/context';
import { isStructureLocked, type Tournament } from '../../lib/tournaments';
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

  function drawSeeding() {
    if (window.confirm(t.entriesView.confirmDraw)) actions.draw();
  }

  return (
    <section>
      <div className="view-title">
        <h2>{t.entriesView.title}</h2>
        <p>{t.entriesView.hint}</p>
      </div>
      <div className="view-toolbar">
        <p className="muted">{locked ? t.groups.locked : t.entriesView.draftHint}</p>
        {!locked && (
          <button type="button" className="secondary" onClick={drawSeeding}>
            {t.groups.draw}
          </button>
        )}
      </div>
      <div className="panel pair-list entries">
        {tournament.seeding.map((pairId, i) => (
          <div key={pairId} className="pair-row">
            <span className="code">{i + 1}</span>
            <PlayerInputs
              tournament={tournament}
              pairId={pairId}
              onSave={(players) => actions.setPlayers(pairId, players)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
