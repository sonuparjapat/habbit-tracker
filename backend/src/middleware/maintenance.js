import { isAdminRole } from '../services/roles.js';
import { getSettings } from '../services/settings.js';
import { HttpError } from './errors.js';

/**
 * While maintenance mode is on (admin setting), members get a 503 with the admin's message.
 * Staff are let through so they can keep working (and turn it off).
 * Place after requireAuth.
 */
export async function blockDuringMaintenance(req, _res, next) {
  const s = await getSettings();
  if (s.maintenance_mode && !isAdminRole(req.user?.role)) throw new HttpError(503, s.maintenance_message, 'MAINTENANCE');
  next();
}
