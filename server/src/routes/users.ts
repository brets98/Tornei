import { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import { UserModel } from '../models/user.js';

export const usersRouter = Router();

usersRouter.get('/', async (_req, res) => {
  const users = await UserModel.find().sort({ createdAt: 1 });
  res.json(users);
});

usersRouter.get('/:id', async (req, res) => {
  const user = isValidObjectId(req.params.id) ? await UserModel.findById(req.params.id) : null;
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json(user);
});

usersRouter.post('/', async (req, res) => {
  const { name, surname, email } = req.body ?? {};
  const user = await UserModel.create({ name, surname, email });
  res.status(201).json(user);
});
