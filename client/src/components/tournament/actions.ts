import type { MatchChanges } from './MatchRow';

/** The changes the tournament views can make; each one is saved by TournamentPage. */
export interface TournamentActions {
  setPlayers: (pairId: string, players: string[]) => void;
  updateMatch: (matchId: string, changes: MatchChanges) => void;
  setGroups: (groups: { id: string; pairIds: string[] }[]) => void;
  draw: () => void;
  /** A typed result that can't be read: explain it, save nothing */
  reportUnreadable: (text: string) => void;
}
