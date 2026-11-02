import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { requireSesion, requireCapacidad } from '../auth/middleware.js';
import { editarTarea, cancelarTarea } from './tareas.service.js';
import { patchTareaSchema, cancelarTareaSchema } from '@afull/shared';
import { ipDe } from '../../lib/ip.js';
import type { Ctx } from '../clientes/service.js';

const ctxDe = (c: Context): Ctx => ({ usuarioId: c.get('usuario').id, ip: ipDe(c) });

export const tareasRoutes = new Hono()
  .use('*', requireSesion, requireCapacidad('comercial'))
  .patch('/:id', async (c) => {
    const id = z.string().uuid().parse(c.req.param('id'));
    const body = patchTareaSchema.parse(await c.req.json().catch(() => null));
    return c.json(await editarTarea(ctxDe(c), id, body));
  })
  .post('/:id/cancelar', async (c) => {
    const id = z.string().uuid().parse(c.req.param('id'));
    const body = cancelarTareaSchema.parse(await c.req.json().catch(() => null));
    return c.json(await cancelarTarea(ctxDe(c), id, body));
  });
