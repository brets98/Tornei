import { Router, type Request, type Response } from 'express';
import { isValidObjectId } from 'mongoose';
import {
  DEFAULT_CATEGORIES,
  parseCircuit,
  parsePastStage,
  ranking,
  tournamentEntries,
  type Stage,
} from '../domain/circuit.js';
import { CircuitModel } from '../models/circuit.js';
import { PlayerModel } from '../models/player.js';
import { TournamentModel } from '../models/tournament.js';
import { linkPlayers } from './players.js';
import { toData } from './tournaments.js';

/** The signed-in user's circuits; another user's circuit answers 404. */
export const circuitsRouter = Router();

async function findOwned(req: Request<{ id: string }>) {
  const { id } = req.params;
  return isValidObjectId(id) ? CircuitModel.findOne({ _id: id, ownerId: req.user!.id }) : null;
}

/**
 * Checks that `value` names one of the user's circuits and one of its categories:
 * `{ circuitId, categoryId }` or null (not a stage). `undefined` when it doesn't.
 */
export async function findStageLink(ownerId: string, value: unknown) {
  if (value === null) return null;
  const link = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const { circuitId, categoryId } = link;
  if (!isValidObjectId(circuitId) || typeof categoryId !== 'string') return undefined;
  const circuit = await CircuitModel.findOne({ _id: circuitId, ownerId });
  if (!circuit?.categories.some((c) => c.id === categoryId)) return undefined;
  return { circuitId: circuit._id, categoryId };
}

circuitsRouter.get('/', async (req, res) => {
  const circuits = await CircuitModel.find({ ownerId: req.user!.id }).sort({ createdAt: -1 });
  const counts = await TournamentModel.aggregate<{ _id: unknown; count: number }>([
    { $match: { 'circuit.circuitId': { $in: circuits.map((c) => c._id) } } },
    { $group: { _id: '$circuit.circuitId', count: { $sum: 1 } } },
  ]);
  res.json(
    circuits.map((c) => ({
      ...c.toJSON(),
      stageCount: counts.find((n) => String(n._id) === c.id)?.count ?? 0,
    })),
  );
});

/** A new circuit; without categories it starts with the defaults (Major, P1, P2). */
circuitsRouter.post('/', async (req, res) => {
  const body = { categories: DEFAULT_CATEGORIES, ...req.body };
  const { circuit, issues } = parseCircuit(body);
  if (issues.length > 0) {
    res.status(400).json({ error: 'Invalid circuit', issues });
    return;
  }
  const created = await CircuitModel.create({ ...circuit, ownerId: req.user!.id });
  res.status(201).json(created);
});

/** The circuit with its stages (newest first) and the ranking of the finished ones. */
circuitsRouter.get('/:id', async (req, res) => {
  const circuit = await findOwned(req);
  if (!circuit) {
    res.status(404).json({ error: 'Circuit not found' });
    return;
  }
  const tournaments = await TournamentModel.find({
    ownerId: circuit.ownerId,
    'circuit.circuitId': circuit._id,
  }).sort({ date: -1, createdAt: -1 });
  const { pastStages } = circuit.toObject();
  const stages = [
    ...tournaments.map((t) => {
      const data = toData(t.toObject());
      return {
        id: t.id as string,
        name: t.name,
        date: t.date,
        categoryId: t.circuit!.categoryId,
        summary: data.summary,
        past: false,
        entries: tournamentEntries(data),
      };
    }),
    ...pastStages.map((s) => ({
      id: s.id,
      name: s.name,
      date: s.date,
      categoryId: s.categoryId,
      summary: null,
      past: true,
      entries: s.entries,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const playerIds = new Set(
    stages.flatMap((s) => (s.entries ?? []).flatMap((e) => e.playerIds ?? [])).filter(Boolean),
  );
  const players = await PlayerModel.find({
    ownerId: circuit.ownerId,
    _id: { $in: [...playerIds] },
  });
  const names = new Map(players.map((p) => [p.id as string, p.name]));
  const result = ranking(stages satisfies Stage[], circuit.categories, names);

  res.json({
    ...circuit.toJSON(),
    stages: stages.map(({ entries: _, ...stage }) => stage),
    ranking: result.rows.map((row) => ({ ...row, name: names.get(row.playerId) ?? '' })),
    unlinked: result.unlinked,
  });
});

circuitsRouter.patch('/:id', async (req, res) => {
  const circuit = await findOwned(req);
  if (!circuit) {
    res.status(404).json({ error: 'Circuit not found' });
    return;
  }
  const current = circuit.toObject();
  const used: string[] = [
    ...(await TournamentModel.distinct('circuit.categoryId', {
      'circuit.circuitId': circuit._id,
    })),
    ...current.pastStages.map((s) => s.categoryId),
  ];
  const { circuit: changed, issues } = parseCircuit(
    {
      name: current.name,
      season: current.season,
      categories: current.categories,
      ...req.body,
    },
    current.categories,
    used,
  );
  if (issues.length > 0) {
    res.status(400).json({ error: 'Invalid circuit', issues });
    return;
  }
  circuit.set(changed);
  await circuit.save();
  res.json(circuit);
});

/** Only a circuit without stages can be removed: unlink or delete them first. */
circuitsRouter.delete('/:id', async (req, res) => {
  const circuit = await findOwned(req);
  if (!circuit) {
    res.status(404).json({ error: 'Circuit not found' });
    return;
  }
  const stages = await TournamentModel.countDocuments({ 'circuit.circuitId': circuit._id });
  if (stages > 0) {
    res.status(409).json({
      error: 'Circuit has stages',
      issues: [{ code: 'CIRCUIT_HAS_STAGES', params: { count: stages } }],
    });
    return;
  }
  await circuit.deleteOne();
  res.status(204).end();
});

/**
 * Past stages: played before they were in the app, entered as each entry's final result.
 * Their names are linked to the registry like a stage's. Each change answers the circuit.
 */
async function savePastStage(
  req: Request<{ id: string; stageId?: string }>,
  res: Response,
  stageId?: string,
) {
  const circuit = await findOwned(req);
  const index = stageId ? (circuit?.pastStages.findIndex((s) => s.id === stageId) ?? -1) : -1;
  if (!circuit || (stageId && index === -1)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const { pastStages, categories } = circuit.toObject();
  const { stage, issues } = parsePastStage(req.body, categories);
  if (issues.length > 0) {
    res.status(400).json({ error: 'Invalid stage', issues });
    return;
  }
  // Names already linked in this stage keep their player
  const before = stageId ? pastStages[index].entries : [];
  const known = new Map(
    before.flatMap((e) => e.players.map((name, i) => [name.toLowerCase(), e.playerIds?.[i]])),
  );
  const entries = await linkPlayers(
    circuit.ownerId,
    stage.entries.map((e) => ({
      ...e,
      playerIds: e.players.map((name) => known.get(name.toLowerCase()) ?? null),
    })),
  );
  const next = { ...stage, entries };
  if (stageId) {
    circuit.set(`pastStages.${index}`, { ...next, id: stageId });
  } else {
    const ids = pastStages.map((p) => Number(p.id.slice(1)) || 0);
    circuit.pastStages.push({ ...next, id: `m${Math.max(0, ...ids) + 1}` });
  }
  await circuit.save();
  res.status(stageId ? 200 : 201).json(circuit);
}

circuitsRouter.post('/:id/stages', (req, res) => savePastStage(req, res));

circuitsRouter.put('/:id/stages/:stageId', (req, res) =>
  savePastStage(req, res, req.params.stageId),
);

circuitsRouter.delete('/:id/stages/:stageId', async (req, res) => {
  const circuit = await findOwned(req);
  const index = circuit?.pastStages.findIndex((p) => p.id === req.params.stageId) ?? -1;
  if (!circuit || index === -1) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  circuit.pastStages.splice(index, 1);
  await circuit.save();
  res.json(circuit);
});
