import { Hono } from 'hono';
import { requireSesion, requireCapacidad } from '../auth/middleware.js';
import { obtenerPanel } from './service.js';

/** Loop 14: panel de Gerardo (oficina; admin pasa siempre). */
export const panelRoutes = new Hono()
  .use('*', requireSesion)
  .get('/', requireCapacidad('comercial'), async (c) => c.json(await obtenerPanel()));
