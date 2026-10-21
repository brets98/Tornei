import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api';
import { PLAYERS_LIST_ID, type Player } from '../lib/circuits';

/**
 * The registry's names as suggestions for player fields with `list={PLAYERS_LIST_ID}`.
 * Reloaded when `version` changes (e.g. after a save added new players).
 */
export function PlayersDatalist({ version }: { version?: string }) {
  const [players, setPlayers] = useState<Player[]>([]);

  useEffect(() => {
    apiGet<Player[]>('/players')
      .then(setPlayers)
      .catch(() => setPlayers([]));
  }, [version]);

  return (
    <datalist id={PLAYERS_LIST_ID}>
      {players.map((p) => (
        <option key={p.id} value={p.name} />
      ))}
    </datalist>
  );
}
