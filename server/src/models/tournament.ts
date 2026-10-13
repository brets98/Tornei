import { model, Schema, type SchemaDefinition, type Types } from 'mongoose';
import { createSchema } from '../db/schema.js';
import { DECIDERS } from '../domain/score.js';
import { FORMATS, SPORTS, STRUCTURE_TYPES, type TournamentData } from '../domain/types.js';

/**
 * A tournament with everything in it: setup, pairs, groups, matches and the derived state
 * (standings, bracket sides, champions, summary), recomputed by `refreshTournament()` on
 * every write. See CLAUDE.md, "Domain: tournaments".
 */
export interface Tournament extends TournamentData {
  ownerId: Types.ObjectId;
}

/** Embedded objects: their own string `id`, no MongoDB `_id`. */
const embedded = (definition: SchemaDefinition) =>
  new Schema(definition, { _id: false, id: false });

const sourceSchema = embedded({
  kind: { type: String, enum: ['group', 'seed', 'winner', 'bye'], required: true },
  groupId: String,
  position: Number,
  index: Number,
  matchId: String,
});

const setSchema = embedded({
  a: { type: Number, required: true },
  b: { type: Number, required: true },
  tiebreak: { type: embedded({ a: Number, b: Number }), default: undefined },
});

const matchSchema = embedded({
  id: { type: String, required: true },
  phase: { type: String, enum: ['group', 'knockout'], required: true },
  groupId: String,
  bracket: { type: String, enum: ['A', 'B'] },
  round: Number,
  index: Number,
  sourceA: sourceSchema,
  sourceB: sourceSchema,
  pairA: { type: String, default: null },
  pairB: { type: String, default: null },
  sets: { type: [setSchema], default: [] },
  scoredPairs: { type: [String], default: undefined },
  courtId: { type: String, default: null },
  timeSlotId: { type: String, default: null },
  state: { type: String, enum: ['todo', 'done', 'invalid', 'bye', 'stale'], required: true },
  winner: { type: String, default: null },
});

const standingSchema = embedded({
  pairId: { type: String, required: true },
  played: Number,
  wins: Number,
  losses: Number,
  setsFor: Number,
  setsAgainst: Number,
  gamesFor: Number,
  gamesAgainst: Number,
});

const tournamentSchema = createSchema<Tournament>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true, trim: true },
  subtitle: { type: String, default: '', trim: true },
  sport: { type: String, enum: SPORTS, required: true },
  format: { type: String, enum: FORMATS, required: true },
  date: { type: String, required: true },
  courts: [
    embedded({ id: { type: String, required: true }, name: { type: String, required: true } }),
  ],
  timeSlots: [
    embedded({ id: { type: String, required: true }, time: { type: String, required: true } }),
  ],
  structure: embedded({
    type: { type: String, enum: STRUCTURE_TYPES, required: true },
    groupCount: Number,
    advanceA: Number,
    advanceB: Number,
  }),
  matchFormat: embedded({
    bestOf: { type: Number, required: true },
    gamesPerSet: { type: Number, required: true },
    decider: { type: String, enum: DECIDERS, required: true },
  }),
  pairs: [embedded({ id: { type: String, required: true }, players: [String] })],
  groups: [
    embedded({
      id: { type: String, required: true },
      pairIds: [String],
      standings: [standingSchema],
      complete: Boolean,
    }),
  ],
  seeding: [String],
  matches: [matchSchema],
  brackets: [
    embedded({
      id: { type: String, enum: ['A', 'B'], required: true },
      size: Number,
      champion: { type: String, default: null },
    }),
  ],
  summary: embedded({
    status: { type: String, enum: ['draft', 'groups', 'knockout', 'finished'], required: true },
    matchesDone: Number,
    matchesTotal: Number,
  }),
});

// Two tabs saving the same tournament: the second save fails (409) instead of overwriting
tournamentSchema.set('optimisticConcurrency', true);
tournamentSchema.index({ ownerId: 1, date: -1, createdAt: -1 });

export const TournamentModel = model<Tournament>('Tournament', tournamentSchema);
