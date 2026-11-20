/**
 * Offline sync (see services/sync.js for how it works).
 *
 *   POST /api/sync   the app sends the changes it saved while offline (max 100 at a time)
 *                    → { results: [{ id, status: applied | rejected | failed | superseded | …, error? }] }
 */
import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../middleware/errors.js';
import { syncBatch } from '../services/sync.js';

export const syncRouter = Router();

const opSchema = z.object({
  id: z.string().trim().min(8).max(64), // made by the phone, unique per change
  method: z.enum(['POST', 'PUT', 'PATCH', 'DELETE']),
  path: z.string().max(200),
  body: z.unknown().optional(),
  at: z.iso.datetime({ offset: true }), // when the member made the change
});

syncRouter.post('/', async (req, res) => {
  const { ops } = parse(z.object({ ops: z.array(opSchema).min(1).max(100) }), req.body);
  res.json({ results: await syncBatch(req.user, ops) });
});
