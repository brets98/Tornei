import { Router, type Request } from 'express';
import { isValidObjectId, type Types } from 'mongoose';
import { CircuitModel } from '../models/circuit.js';
import { PLAYER_NAME_LENGTH, PlayerModel, playerKey } from '../models/player.js';
import { TournamentModel } from '../models/tournament.js';

/** The signed-in user's player registry; another user's player answers 404. */
export const playersRouter = Router();

async function findOwned(req: Request<{ id: string }>) {
  const { id } = req.params;
  return isValidObjectId(id) ? PlayerModel.findOne({ _id: id, ownerId: req.user!.id }) : null;
}

function nameIssue(value: unknown) {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name) return { name, issue: { code: 'PLAYER_NAME_REQUIRED' } };
  if (name.length > PLAYER_NAME_LENGTH) {
    return { name, issue: { code: 'PLAYER_NAME_TOO_LONG', params: { max: PLAYER_NAME_LENGTH } } };
  }
  return { name, issue: null };
}

const exists = (name: string) => ({ code: 'PLAYER_EXISTS', params: { name } });

/**
 * Links the names of `pairs` to the owner's registry, adding the players not in it yet.
 * Only names without a link are looked up (by name, ignoring case), so a link survives a
 * player's rename. Used for circuit stages: their ranking counts linked players only.
 */
export async function linkPlayers<T extends { players: string[]; playerIds?: (string | null)[] }>(
  ownerId: Types.ObjectId | string,
  pairs: T[],
) {
  const linked: T[] = [];
  for (const pair of pairs) {
    const playerIds: (string | null)[] = [];
    for (const [i, name] of pair.players.entries()) {
      const current = pair.playerIds?.[i];
      if (current || !name.trim()) {
        playerIds.push(current ?? null);
        continue;
      }
      const player = await PlayerModel.findOneAndUpdate(
        { ownerId, key: playerKey(name) },
        { $setOnInsert: { name: name.trim() } },
        { upsert: true, returnDocument: 'after' },
      );
      playerIds.push(player.id as string);
    }
    linked.push({ ...pair, playerIds });
  }
  return linked;
}

playersRouter.get('/', async (req, res) => {
  const players = await PlayerModel.find({ ownerId: req.user!.id }).sort({ key: 1 });
  res.json(players);
});

playersRouter.post('/', async (req, res) => {
  const { name, issue } = nameIssue(req.body?.name);
  if (issue) {
    res.status(400).json({ error: 'Invalid player', issues: [issue] });
    return;
  }
  const ownerId = req.user!.id;
  if (await PlayerModel.exists({ ownerId, key: playerKey(name) })) {
    res.status(400).json({ error: 'Invalid player', issues: [exists(name)] });
    return;
  }
  const player = await PlayerModel.create({ ownerId, name, key: playerKey(name) });
  res.status(201).json(player);
});

/** Renames a player, also in every tournament where they play. */
playersRouter.patch('/:id', async (req, res) => {
  const player = await findOwned(req);
  if (!player) {
    res.status(404).json({ error: 'Player not found' });
    return;
  }
  const { name, issue } = nameIssue(req.body?.name);
  if (issue) {
    res.status(400).json({ error: 'Invalid player', issues: [issue] });
    return;
  }
  const key = playerKey(name);
  if (key !== player.key && (await PlayerModel.exists({ ownerId: player.ownerId, key }))) {
    res.status(400).json({ error: 'Invalid player', issues: [exists(name)] });
    return;
  }
  player.set({ name, key });
  await player.save();

  const tournaments = await TournamentModel.find({
    ownerId: player.ownerId,
    'pairs.playerIds': player.id,
  });
  for (const tournament of tournaments) {
    for (const pair of tournament.pairs) {
      pair.playerIds?.forEach((id, i) => {
        if (id === player.id) pair.players[i] = name;
      });
    }
    tournament.markModified('pairs');
    await tournament.save();
  }
  const circuits = await CircuitModel.find({
    ownerId: player.ownerId,
    'pastStages.entries.playerIds': player.id,
  });
  for (const circuit of circuits) {
    for (const stage of circuit.pastStages) {
      for (const entry of stage.entries) {
        entry.playerIds?.forEach((id, i) => {
          if (id === player.id) entry.players[i] = name;
        });
      }
    }
    circuit.markModified('pastStages');
    await circuit.save();
  }
  res.json(player);
});

/** Only a player who plays in no tournament can be removed. */
playersRouter.delete('/:id', async (req, res) => {
  const player = await findOwned(req);
  if (!player) {
    res.status(404).json({ error: 'Player not found' });
    return;
  }
  const used =
    (await TournamentModel.countDocuments({
      ownerId: player.ownerId,
      'pairs.playerIds': player.id,
    })) +
    (await CircuitModel.countDocuments({
      ownerId: player.ownerId,
      'pastStages.entries.playerIds': player.id,
    }));
  if (used > 0) {
    res.status(409).json({
      error: 'Player in use',
      issues: [{ code: 'PLAYER_IN_USE', params: { count: used } }],
    });
    return;
  }
  await player.deleteOne();
  res.status(204).end();
});
