import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { filtroCosteoSchema } from '@afull/shared';
import { requireSesion, requireCapacidad } from '../auth/middleware.js';
import { costeoDeOT, costeoDeProyecto, listarCosteos } from './consultas.service.js';

const idDe = (c: Context) => z.string().uuid().parse(c.req.param('id'));

/** Costeo real (Loop 6). Solo lectura y solo admin/comercial: los operarios nunca ven dinero. */
export const costeoRoutes = new Hono()
  .use('*', requireSesion, requireCapacidad('comercial'))
  .get('/ots', async (c) => c.json(await listarCosteos(filtroCosteoSchema.parse(c.req.query()))))
  .get('/ot/:id', async (c) => c.json(await costeoDeOT(idDe(c))))
  .get('/proyecto/:id', async (c) => c.json(await costeoDeProyecto(idDe(c))));
