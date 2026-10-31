import { Hono } from 'hono';
import { z } from 'zod';
import { requireSesion, requireCapacidad } from '../auth/middleware.js';
import { listarOTs, crearOT, transicionar } from './ot.service.js';
import { nuevaOTSchema, transicionSchema, filtroOTSchema } from '@afull/shared';
import { paginaSchema } from '../../lib/paginacion.js';
import { ipDe } from '../../lib/ip.js';

export const otRoutes = new Hono()
  .use('*', requireSesion, requireCapacidad('comercial'))
  .get('/', async (c) => {
    const f = filtroOTSchema.parse(c.req.query());
    const pagina = paginaSchema.parse(c.req.query('pagina'));
    return c.json(await listarOTs({ pagina, ...f }));
  })
  .post('/', async (c) => {
    const body = nuevaOTSchema.parse(await c.req.json().catch(() => null));
    const res = await crearOT({ usuarioId: c.get('usuario').id, ip: ipDe(c) }, body);
    return c.json(res, 201);
  })
  .post('/:id/transicionar', async (c) => {
    const id = z.string().uuid().parse(c.req.param('id'));
    const body = transicionSchema.parse(await c.req.json().catch(() => null));
    return c.json(await transicionar({ usuarioId: c.get('usuario').id, ip: ipDe(c) }, id, body));
  });
