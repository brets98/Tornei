import { Router, type Request } from 'express';
import { isValidObjectId } from 'mongoose';
import { DEFAULT_CATEGORIES, parseCircuit, ranking, type Stage } from '../domain/circuit.js';
import { CircuitModel } from '../models/circuit.js';
import { PlayerModel } from '../models/player.js';
import { TournamentModel } from '../models/tournament.js';
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
  const stages: Stage[] = tournaments.map((t) => ({
    id: t.id as string,
    name: t.name,
    date: t.date,
    categoryId: t.circuit!.categoryId,
    data: toData(t.toObject()),
  }));

  const playerIds = new Set(
    stages.flatMap((s) => s.data.pairs.flatMap((p) => p.playerIds ?? [])).filter(Boolean),
  );
  const players = await PlayerModel.find({
    ownerId: circuit.ownerId,
    _id: { $in: [...playerIds] },
  });
  const names = new Map(players.map((p) => [p.id as string, p.name]));
  const result = ranking(stages, circuit.categories, names);

  res.json({
    ...circuit.toJSON(),
    stages: stages.map(({ id, name, date, categoryId, data }) => ({
      id,
      name,
      date,
      categoryId,
      summary: data.summary,
    })),
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
  const used: string[] = await TournamentModel.distinct('circuit.categoryId', {
    'circuit.circuitId': circuit._id,
  });
  const current = circuit.toObject();
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
