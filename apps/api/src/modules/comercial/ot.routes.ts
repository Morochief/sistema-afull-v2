import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { requireSesion, requireCapacidad } from '../auth/middleware.js';
import { listarOTs, obtenerDetalleOT, crearOT, editarOT, transicionar } from './ot.service.js';
import { listarTareasOT, agregarTareaOT } from './tareas.service.js';
import { nuevaOTSchema, patchOTSchema, transicionSchema, filtroOTSchema, nuevaTareaSchema } from '@afull/shared';
import { paginaSchema } from '../../lib/paginacion.js';
import { ipDe } from '../../lib/ip.js';
import type { Ctx } from '../clientes/service.js';

const ctxDe = (c: Context): Ctx => ({ usuarioId: c.get('usuario').id, ip: ipDe(c) });

export const otRoutes = new Hono()
  .use('*', requireSesion, requireCapacidad('comercial'))
  .get('/', async (c) => {
    const f = filtroOTSchema.parse(c.req.query());
    const pagina = paginaSchema.parse(c.req.query('pagina'));
    return c.json(await listarOTs({ pagina, ...f }));
  })
  .post('/', async (c) => {
    const body = nuevaOTSchema.parse(await c.req.json().catch(() => null));
    return c.json(await crearOT(ctxDe(c), body), 201);
  })
  .get('/:id', async (c) => {
    const id = z.string().uuid().parse(c.req.param('id'));
    return c.json(await obtenerDetalleOT(id));
  })
  .patch('/:id', async (c) => {
    const id = z.string().uuid().parse(c.req.param('id'));
    const body = patchOTSchema.parse(await c.req.json().catch(() => null));
    return c.json(await editarOT(ctxDe(c), id, body));
  })
  .post('/:id/transicionar', async (c) => {
    const id = z.string().uuid().parse(c.req.param('id'));
    const body = transicionSchema.parse(await c.req.json().catch(() => null));
    return c.json(await transicionar(ctxDe(c), id, body));
  })
  .get('/:id/tareas', async (c) => {
    const id = z.string().uuid().parse(c.req.param('id'));
    return c.json(await listarTareasOT(id));
  })
  .post('/:id/tareas', async (c) => {
    const id = z.string().uuid().parse(c.req.param('id'));
    const body = nuevaTareaSchema.parse(await c.req.json().catch(() => null));
    return c.json(await agregarTareaOT(ctxDe(c), id, body), 201);
  });
