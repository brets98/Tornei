import type { BracketId, Tournament } from './tournaments';

/** One phase on screen: a tournament's groups, or one of its brackets. */
export interface Slide {
  tournament: Tournament;
  /** null: the groups */
  bracket: BracketId | null;
}

/**
 * The phases being played in every tournament under way, in list order: the groups while the
 * group phase runs, then each bracket still without a champion (all of them if every one has).
 */
export function activeSlides(tournaments: Tournament[]): Slide[] {
  return tournaments.flatMap((tournament): Slide[] => {
    const { status } = tournament.summary;
    if (status === 'groups' && tournament.groups.length > 0) {
      return [{ tournament, bracket: null }];
    }
    if (status !== 'knockout') return [];
    const open = tournament.brackets.filter((b) => !b.champion);
    return (open.length > 0 ? open : tournament.brackets).map((b) => ({
      tournament,
      bracket: b.id,
    }));
  });
}
