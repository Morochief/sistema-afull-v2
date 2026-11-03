import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { filtroProyectosSchema, cerrarCancelarProyectoSchema } from '@afull/shared';
import { requireSesion, requireCapacidad } from '../auth/middleware.js';
import { ipDe } from '../../lib/ip.js';
import type { Ctx } from '../clientes/service.js';
import { listarProyectos, obtenerProyecto, finalizarProyecto } from './service.js';

const ctxDe = (c: Context): Ctx => ({ usuarioId: c.get('usuario').id, ip: ipDe(c) });
const idDe = (c: Context) => z.string().uuid().parse(c.req.param('id'));

export const proyectosRoutes = new Hono()
  .use('*', requireSesion, requireCapacidad('comercial'))
  .get('/', async (c) => c.json(await listarProyectos(filtroProyectosSchema.parse(c.req.query()))))
  .get('/:id', async (c) => c.json(await obtenerProyecto(idDe(c))))
  .post('/:id/cerrar', async (c) => {
    const b = cerrarCancelarProyectoSchema.parse((await c.req.json().catch(() => null)) ?? {});
    return c.json(await finalizarProyecto(ctxDe(c), idDe(c), 'CERRADO', b.comentario));
  })
  .post('/:id/cancelar', async (c) => {
    const b = cerrarCancelarProyectoSchema.parse((await c.req.json().catch(() => null)) ?? {});
    return c.json(await finalizarProyecto(ctxDe(c), idDe(c), 'CANCELADO', b.comentario));
  });
