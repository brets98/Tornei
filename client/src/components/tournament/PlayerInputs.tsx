import { fill, useI18n } from '../../i18n/context';
import { PLAYERS_LIST_ID } from '../../lib/circuits';
import { pairCode, type Tournament } from '../../lib/tournaments';
import { CommitInput } from './CommitInput';

interface Props {
  tournament: Tournament;
  pairId: string;
  onSave: (players: string[]) => void;
}

/** The names of a pair's players (one field per player), saved when a field is left. */
export function PlayerInputs({ tournament, pairId, onSave }: Props) {
  const { t } = useI18n();
  const players = tournament.pairs.find((p) => p.id === pairId)?.players ?? [];
  const code = pairCode(tournament, pairId);

  return (
    <span className="player-inputs">
      {players.map((name, i) => (
        <CommitInput
          key={i}
          value={name}
          maxLength={60}
          // Circuit stages: names from the player registry (PlayersDatalist)
          list={tournament.circuit ? PLAYERS_LIST_ID : undefined}
          placeholder={players.length > 1 ? `${code} · ${i + 1}` : code}
          aria-label={fill(t.groups.playerName, { n: i + 1, pair: code })}
          onCommit={(value) => onSave(players.map((p, k) => (k === i ? value : p)))}
        />
      ))}
    </span>
  );
}
