import { Router, type Request } from 'express';
import { isValidObjectId } from 'mongoose';
import { parseSetup } from '../domain/setup.js';
import { buildMatches, buildTournament, refreshTournament } from '../domain/tournament.js';
import type { TournamentData } from '../domain/types.js';
import { TournamentModel } from '../models/tournament.js';

/** Only the owner can see or change a tournament; anyone else gets 404, as if it didn't exist. */
export const tournamentsRouter = Router();

const LIST_FIELDS = 'name subtitle sport format date summary createdAt updatedAt';

async function findOwned(req: Request<{ id: string }>) {
  const { id } = req.params;
  return isValidObjectId(id) ? TournamentModel.findOne({ _id: id, ownerId: req.user!.id }) : null;
}

tournamentsRouter.get('/', async (req, res) => {
  const tournaments = await TournamentModel.find({ ownerId: req.user!.id })
    .select(LIST_FIELDS)
    .sort({ date: -1, createdAt: -1 });
  res.json(tournaments);
});

/** What the wizard's choices would produce, or why they can't work. Saves nothing. */
tournamentsRouter.post('/preview', (req, res) => {
  const { setup, issues } = parseSetup(req.body);
  if (issues.length > 0) {
    res.json({ issues, preview: null });
    return;
  }
  const t = buildTournament(setup);
  res.json({
    issues,
    preview: {
      groupSizes: t.groups.map((g) => g.pairIds.length),
      brackets: t.brackets.map((b) => {
        const entrants = t.matches
          .filter((m) => m.bracket === b.id && m.round === 0)
          .flatMap((m) => [m.sourceA, m.sourceB])
          .filter((s) => s?.kind !== 'bye').length;
        return { id: b.id, entrants, size: b.size, byes: b.size - entrants };
      }),
      matchesTotal: t.summary.matchesTotal,
    },
  });
});

tournamentsRouter.post('/', async (req, res) => {
  const { setup, issues } = parseSetup(req.body);
  if (issues.length > 0) {
    res.status(400).json({ error: 'Invalid setup', issues });
    return;
  }
  const tournament = await TournamentModel.create({
    ...buildTournament(setup),
    ownerId: req.user!.id,
  });
  res.status(201).json(tournament);
});

tournamentsRouter.get('/:id', async (req, res) => {
  const tournament = await findOwned(req);
  if (!tournament) {
    res.status(404).json({ error: 'Tournament not found' });
    return;
  }
  res.json(tournament);
});

tournamentsRouter.delete('/:id', async (req, res) => {
  const tournament = await findOwned(req);
  if (!tournament) {
    res.status(404).json({ error: 'Tournament not found' });
    return;
  }
  await tournament.deleteOne();
  res.status(204).end();
});

/** A copy with the same setup, pairs and schedule, without results. */
tournamentsRouter.post('/:id/duplicate', async (req, res) => {
  const original = await findOwned(req);
  if (!original) {
    res.status(404).json({ error: 'Tournament not found' });
    return;
  }
  const data = original.toObject() as TournamentData;
  const copy: TournamentData = {
    name: `${data.name} (copia)`,
    subtitle: data.subtitle,
    sport: data.sport,
    format: data.format,
    date: data.date,
    courts: data.courts,
    timeSlots: data.timeSlots,
    structure: data.structure,
    pairs: data.pairs,
    groups: data.groups.map((g) => ({ ...g, standings: [], complete: false })),
    seeding: data.seeding,
    matches: data.matches,
    brackets: [],
    summary: data.summary,
  };
  const tournament = await TournamentModel.create({
    ...refreshTournament({ ...copy, ...buildMatches(copy) }),
    ownerId: req.user!.id,
  });
  res.status(201).json(tournament);
});
