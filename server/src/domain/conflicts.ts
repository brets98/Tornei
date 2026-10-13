import type { Conflict, Match } from './types.js';

/**
 * Scheduling clashes, in time slot order: two matches on the same court in the same slot, or
 * a pair playing two matches in the same slot. Byes don't count; knockout matches count for a
 * pair once the pair is known.
 */
export function findConflicts(matches: Match[], slotOrder: string[]): Conflict[] {
  const scheduled = matches.filter((m) => m.state !== 'bye' && m.timeSlotId);
  const conflicts: Conflict[] = [];

  const clashes = (key: (m: Match) => string[]) => {
    const byKey = new Map<string, string[]>();
    for (const m of scheduled) {
      for (const k of key(m)) byKey.set(k, [...(byKey.get(k) ?? []), m.id]);
    }
    return [...byKey].filter(([, ids]) => ids.length > 1);
  };

  for (const [key, matchIds] of clashes((m) =>
    m.courtId ? [`${m.timeSlotId}|${m.courtId}`] : [],
  )) {
    const [timeSlotId, courtId] = key.split('|');
    conflicts.push({ kind: 'court', timeSlotId, courtId, matchIds });
  }
  for (const [key, matchIds] of clashes((m) =>
    [m.pairA, m.pairB].filter((p): p is string => p !== null).map((p) => `${m.timeSlotId}|${p}`),
  )) {
    const [timeSlotId, pairId] = key.split('|');
    conflicts.push({ kind: 'pair', timeSlotId, pairId, matchIds });
  }

  const slotIndex = (id: string) => slotOrder.indexOf(id);
  return conflicts.sort((a, b) => slotIndex(a.timeSlotId) - slotIndex(b.timeSlotId));
}
