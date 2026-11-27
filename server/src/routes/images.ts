import { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import { ImageModel } from '../models/image.js';

/** Images, only for their owner. An image never changes: a new upload gets a new id. */
export const imagesRouter = Router();

imagesRouter.get('/:id', async (req, res) => {
  const { id } = req.params;
  const image = isValidObjectId(id)
    ? await ImageModel.findOne({ _id: id, ownerId: req.user!.id })
    : null;
  if (!image) {
    res.status(404).json({ error: 'Image not found' });
    return;
  }
  res.set({
    'Content-Type': image.contentType,
    'Cache-Control': 'private, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  });
  res.send(image.data);
});
