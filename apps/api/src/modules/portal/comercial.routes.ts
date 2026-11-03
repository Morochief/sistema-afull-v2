import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { nuevoAccesoPortalSchema, filtroPedidosSchema, convertirPedidoSchema, descartarPedidoSchema } from '@afull/shared';
import { requireSesion, requireCapacidad } from '../auth/middleware.js';
import { ipDe } from '../../lib/ip.js';
import type { Ctx } from '../clientes/service.js';
import { crearAcceso, listarAccesos, revocarAcceso, listarPedidos, obtenerPedido, resolverPedido } from './comercial.service.js';

const ctxDe = (c: Context): Ctx => ({ usuarioId: c.get('usuario').id, ip: ipDe(c) });
const idDe = (c: Context, n = 'id') => z.string().uuid().parse(c.req.param(n));
const cuerpo = (c: Context) => c.req.json().catch(() => null);

/** Enlaces del portal por cliente (Comercial). */
export const portalAccesosRoutes = new Hono()
  .use('*', requireSesion, requireCapacidad('comercial'))
  .get('/cliente/:clienteId', async (c) => c.json(await listarAccesos(idDe(c, 'clienteId'))))
  .post('/', async (c) => c.json(await crearAcceso(ctxDe(c), nuevoAccesoPortalSchema.parse(await cuerpo(c))), 201))
  .post('/:id/revocar', async (c) => c.json(await revocarAcceso(ctxDe(c), idDe(c))));

/** Bandeja de pedidos que llegan por el portal (Comercial). */
export const pedidosRoutes = new Hono()
  .use('*', requireSesion, requireCapacidad('comercial'))
  .get('/', async (c) => c.json(await listarPedidos(filtroPedidosSchema.parse(c.req.query()))))
  .get('/:id', async (c) => c.json(await obtenerPedido(idDe(c))))
  .post('/:id/convertir', async (c) => c.json(await resolverPedido(ctxDe(c), idDe(c), convertirPedidoSchema.parse(await cuerpo(c)))))
  .post('/:id/descartar', async (c) => c.json(await resolverPedido(ctxDe(c), idDe(c), { descartar: descartarPedidoSchema.parse(await cuerpo(c)).motivo })));
