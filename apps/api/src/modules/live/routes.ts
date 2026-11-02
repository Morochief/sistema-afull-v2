import { Hono } from 'hono';
import { requireSesion, requireCapacidad } from '../auth/middleware.js';
import { obtenerEstadoLive } from './service.js';

export const liveRoutes = new Hono()
  .use('*', requireSesion, requireCapacidad('comercial'))
  .get('/estado', async (c) => {
    return c.json(await obtenerEstadoLive());
  });
