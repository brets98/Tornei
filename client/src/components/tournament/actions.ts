import type { StageLink } from '../../lib/circuits';
import type { ImageKind } from '../../lib/images';
import type { MatchFormat } from '../../lib/score';
import type { BracketId } from '../../lib/tournaments';
import type { MatchChanges } from './MatchRow';

/** What the settings tab saves; courts and slots without an id are new. */
export interface SettingsChanges {
  name: string;
  subtitle: string;
  date: string;
  courts: { id?: string; name: string }[];
  timeSlots: { id?: string; time: string }[];
  matchFormat: MatchFormat;
  /** Group matches, when played differently; null = like `matchFormat` */
  groupMatchFormat: MatchFormat | null;
  /** A stage of this circuit, or null */
  circuit: StageLink | null;
}

/** The changes the tournament views can make; each one is saved by TournamentPage. */
export interface TournamentActions {
  setPlayers: (pairId: string, players: string[]) => void;
  /** Consolation draw: counts from the next draw */
  setLevel: (pairId: string, level: number) => void;
  updateMatch: (matchId: string, changes: MatchChanges) => void;
  setGroups: (groups: { id: string; pairIds: string[] }[]) => void;
  /** A new entry (no names) at the end of a group, until the knockout starts */
  addPair: (groupId: string) => void;
  /** Removes an entry and its group matches, until the knockout starts */
  removePair: (pairId: string) => void;
  draw: () => void;
  updateSettings: (changes: SettingsChanges) => void;
  resetResults: () => void;
  /** Uploads (a file) or removes (null) the logo or the background */
  setImage: (kind: ImageKind, file: Blob | null) => void;
  /** Clears one bracket's results (bracket A also clears the consolation it fills) */
  resetBracket: (bracketId: BracketId) => void;
  /** A typed result that can't be read: explain it, save nothing */
  reportUnreadable: (text: string) => void;
}
