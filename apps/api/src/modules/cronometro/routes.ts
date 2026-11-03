import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { requireSesion, requireAlgunaCapacidad } from '../auth/middleware.js';
import { obtenerMiTrabajo, iniciarTarea } from './service.js';
import { pausarTarea, finalizarTarea } from './mutaciones.service.js';
import { iniciarTareaSchema, pausarTareaSchema, finalizarTareaSchema } from '@afull/shared';
import { ipDe } from '../../lib/ip.js';
import type { Ctx } from '../clientes/service.js';

const ctxDe = (c: Context): Ctx => ({ usuarioId: c.get('usuario').id, ip: ipDe(c) });

export const cronometroRoutes = new Hono()
  .use('*', requireSesion, requireAlgunaCapacidad('taller', 'montaje', 'diseno', 'comercial'))
  .get('/', async (c) => {
    return c.json(await obtenerMiTrabajo(ctxDe(c)));
  })
  .post('/tareas/:id/iniciar', async (c) => {
    const id = z.string().uuid().parse(c.req.param('id'));
    const body = iniciarTareaSchema.parse(await c.req.json().catch(() => null));
    const r = await iniciarTarea(ctxDe(c), id, body.claveIdempotencia);
    return c.json(r, r.esIdempotente ? 200 : 201);
  })
  .post('/tareas/:id/pausar', async (c) => {
    const id = z.string().uuid().parse(c.req.param('id'));
    const body = pausarTareaSchema.parse(await c.req.json().catch(() => null));
    return c.json(await pausarTarea(ctxDe(c), id, body.motivo, body.claveIdempotencia));
  })
  .post('/tareas/:id/finalizar', async (c) => {
    const id = z.string().uuid().parse(c.req.param('id'));
    const body = finalizarTareaSchema.parse(await c.req.json().catch(() => null));
    return c.json(await finalizarTarea(ctxDe(c), id, body.comentario, body.claveIdempotencia));
  });
