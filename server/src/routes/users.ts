import { Router } from 'express';
import { UserModel } from '../models/user.js';

export const usersRouter = Router();

usersRouter.post('/', async (req, res) => {
  const { name, surname, email } = req.body ?? {};
  const user = await UserModel.create({ name, surname, email });
  res.status(201).json(user);
});
