import { Router, type Request, type Response } from 'express';
import { isValidObjectId } from 'mongoose';
import {
  draw,
  resetResults,
  setGroups,
  setPlayers,
  updateMatch,
  updateSettings,
  type EditResult,
} from '../domain/edit.js';
import { exportTournament, importTournament } from '../domain/transfer.js';
import { LIMITS, parseSetup } from '../domain/setup.js';
import { buildMatches, buildTournament, refreshTournament } from '../domain/tournament.js';
import type { TournamentData } from '../domain/types.js';
import type { Tournament } from '../models/tournament.js';
import { TournamentModel } from '../models/tournament.js';

/** Only the owner can see or change a tournament; anyone else gets 404, as if it didn't exist. */
export const tournamentsRouter = Router();

const LIST_FIELDS = 'name subtitle sport format date summary createdAt updatedAt';

async function findOwned(req: Request<{ id: string }>) {
  const { id } = req.params;
  return isValidObjectId(id) ? TournamentModel.findOne({ _id: id, ownerId: req.user!.id }) : null;
}

const DATA_FIELDS = [
  'name',
  'subtitle',
  'sport',
  'format',
  'date',
  'courts',
  'timeSlots',
  'structure',
  'matchFormat',
  'pairs',
  'groups',
  'seeding',
  'matches',
  'brackets',
  'summary',
  'conflicts',
] as const satisfies readonly (keyof TournamentData)[];

function toData(tournament: Tournament): TournamentData {
  return Object.fromEntries(
    DATA_FIELDS.map((key) => [key, tournament[key]]),
  ) as unknown as TournamentData;
}

/**
 * Loads the user's tournament, applies `edit` to it and saves the result (with its derived
 * state). 404 if the tournament (or the pair/match) doesn't exist, 400 with `issues` if the
 * edit isn't allowed, 409 if someone saved the tournament in the meantime.
 */
async function applyEdit(
  req: Request<{ id: string }>,
  res: Response,
  edit: (data: TournamentData) => EditResult,
) {
  const tournament = await findOwned(req);
  if (!tournament) {
    res.status(404).json({ error: 'Tournament not found' });
    return;
  }
  const result = edit(toData(tournament.toObject()));
  if (result.issues?.some((i) => i.code === 'NOT_FOUND')) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (result.issues) {
    res.status(400).json({ error: 'Invalid change', issues: result.issues });
    return;
  }
  tournament.set(result.data);
  await tournament.save();
  res.json(tournament);
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

/** A new tournament from an exported file; always a new one, never an overwrite. */
tournamentsRouter.post('/import', async (req, res) => {
  const result = importTournament(req.body);
  if (result.issues) {
    res.status(400).json({ error: 'Invalid tournament file', issues: result.issues });
    return;
  }
  const tournament = await TournamentModel.create({ ...result.data, ownerId: req.user!.id });
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

/**
 * A copy with the same setup, pairs and schedule, without results. The client sends the
 * copy's `name` (in the user's language); without it the copy keeps the original name.
 */
tournamentsRouter.post('/:id/duplicate', async (req, res) => {
  const original = await findOwned(req);
  if (!original) {
    res.status(404).json({ error: 'Tournament not found' });
    return;
  }
  const data = toData(original.toObject());
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const copy = { ...data, name: name && name.length <= LIMITS.nameLength ? name : data.name };
  const tournament = await TournamentModel.create({
    ...refreshTournament({ ...copy, ...buildMatches(copy) }),
    ownerId: req.user!.id,
  });
  res.status(201).json(tournament);
});

/** The tournament as a file (see `exportTournament`), to keep or to import again. */
tournamentsRouter.get('/:id/export', async (req, res) => {
  const tournament = await findOwned(req);
  if (!tournament) {
    res.status(404).json({ error: 'Tournament not found' });
    return;
  }
  res.json(exportTournament(toData(tournament.toObject())));
});

tournamentsRouter.patch('/:id/settings', (req, res) =>
  applyEdit(req, res, (data) => updateSettings(data, req.body)),
);

tournamentsRouter.post('/:id/reset', (req, res) =>
  applyEdit(req, res, (data) => resetResults(data)),
);

tournamentsRouter.patch('/:id/pairs/:pairId', (req, res) =>
  applyEdit(req, res, (data) => setPlayers(data, req.params.pairId, req.body?.players)),
);

tournamentsRouter.put('/:id/groups', (req, res) =>
  applyEdit(req, res, (data) => setGroups(data, req.body?.groups)),
);

tournamentsRouter.post('/:id/draw', (req, res) => applyEdit(req, res, (data) => draw(data)));

tournamentsRouter.patch('/:id/matches/:matchId', (req, res) =>
  applyEdit(req, res, (data) => updateMatch(data, req.params.matchId, req.body)),
);
