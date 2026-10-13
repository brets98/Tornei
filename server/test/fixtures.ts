/** A valid wizard body: the prototype tournament (12 pairs in 4 groups, brackets A and B). */
export const validSetup = {
  name: '  Torneo di primavera ',
  subtitle: 'Gironi',
  sport: 'padel',
  format: 'doubles',
  date: '2026-10-20',
  pairCount: 12,
  courts: ['Bigi', 'Mediolanum'],
  timeSlots: ['20:00', '9:30', '19:00'],
  structure: { type: 'groups_knockout', groupCount: 4, advanceA: 2, advanceB: 1 },
};
