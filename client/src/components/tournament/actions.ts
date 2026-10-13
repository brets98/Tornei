import type { MatchFormat } from '../../lib/score';
import type { MatchChanges } from './MatchRow';

/** What the settings tab saves; courts and slots without an id are new. */
export interface SettingsChanges {
  name: string;
  subtitle: string;
  date: string;
  courts: { id?: string; name: string }[];
  timeSlots: { id?: string; time: string }[];
  matchFormat: MatchFormat;
}

/** The changes the tournament views can make; each one is saved by TournamentPage. */
export interface TournamentActions {
  setPlayers: (pairId: string, players: string[]) => void;
  updateMatch: (matchId: string, changes: MatchChanges) => void;
  setGroups: (groups: { id: string; pairIds: string[] }[]) => void;
  draw: () => void;
  updateSettings: (changes: SettingsChanges) => void;
  resetResults: () => void;
  /** A typed result that can't be read: explain it, save nothing */
  reportUnreadable: (text: string) => void;
}
