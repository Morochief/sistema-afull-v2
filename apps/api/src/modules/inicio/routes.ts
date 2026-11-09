import { Hono } from 'hono';
import { requireSesion, requireCapacidad } from '../auth/middleware.js';
import { tableroInicio } from './service.js';

/** Tablero de inicio de la oficina (comercial; admin pasa siempre). */
export const inicioRoutes = new Hono()
  .use('*', requireSesion, requireCapacidad('comercial'))
  .get('/', async (c) => c.json(await tableroInicio(c.get('usuario').capacidades as string[])));
