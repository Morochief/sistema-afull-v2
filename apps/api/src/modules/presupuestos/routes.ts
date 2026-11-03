import { Hono, type Context } from 'hono';
import { z } from 'zod';
import {
  nuevoPresupuestoSchema,
  patchPresupuestoSchema,
  itemPresupuestoSchema,
  patchItemPresupuestoSchema,
  transicionarPresupuestoSchema,
  filtroPresupuestosSchema,
} from '@afull/shared';
import { requireSesion, requireCapacidad } from '../auth/middleware.js';
import { ipDe } from '../../lib/ip.js';
import type { Ctx } from '../clientes/service.js';
import { listarPresupuestos, obtenerPresupuesto } from './consultas.service.js';
import { crearPresupuesto, editarPresupuesto, agregarItem, editarItem } from './borrador.service.js';
import { aprobarPresupuesto } from './aprobacion.service.js';
import { enviarPresupuesto, rechazarPresupuesto, anularPresupuesto, nuevaVersion } from './transiciones.service.js';

const ctxDe = (c: Context): Ctx => ({ usuarioId: c.get('usuario').id, ip: ipDe(c) });
const idDe = (c: Context, nombre = 'id') => z.string().uuid().parse(c.req.param(nombre));
const cuerpo = async (c: Context) => c.req.json().catch(() => null);

export const presupuestosRoutes = new Hono()
  .use('*', requireSesion, requireCapacidad('comercial'))
  .get('/', async (c) => c.json(await listarPresupuestos(filtroPresupuestosSchema.parse(c.req.query()))))
  .post('/', async (c) => c.json(await crearPresupuesto(ctxDe(c), nuevoPresupuestoSchema.parse(await cuerpo(c))), 201))
  .get('/:id', async (c) => c.json(await obtenerPresupuesto(idDe(c))))
  .patch('/:id', async (c) => c.json(await editarPresupuesto(ctxDe(c), idDe(c), patchPresupuestoSchema.parse(await cuerpo(c)))))
  .post('/:id/items', async (c) =>
    c.json(await agregarItem(ctxDe(c), idDe(c), itemPresupuestoSchema.parse(await cuerpo(c))), 201)
  )
  .patch('/:id/items/:itemId', async (c) =>
    c.json(await editarItem(ctxDe(c), idDe(c), idDe(c, 'itemId'), patchItemPresupuestoSchema.parse(await cuerpo(c))))
  )
  .post('/:id/enviar', async (c) => {
    const t = transicionarPresupuestoSchema.parse(await cuerpo(c));
    return c.json(await enviarPresupuesto(ctxDe(c), idDe(c), t.desde));
  })
  .post('/:id/aprobar', async (c) => {
    const t = transicionarPresupuestoSchema.parse(await cuerpo(c));
    return c.json(await aprobarPresupuesto(ctxDe(c), idDe(c), t.desde, t.comentario));
  })
  .post('/:id/rechazar', async (c) => {
    const t = transicionarPresupuestoSchema.parse(await cuerpo(c));
    return c.json(await rechazarPresupuesto(ctxDe(c), idDe(c), t.desde, t.comentario));
  })
  .post('/:id/anular', async (c) => {
    const t = transicionarPresupuestoSchema.parse(await cuerpo(c));
    return c.json(await anularPresupuesto(ctxDe(c), idDe(c), t.desde, t.comentario));
  })
  .post('/:id/nueva-version', async (c) => {
    const t = transicionarPresupuestoSchema.parse(await cuerpo(c));
    return c.json(await nuevaVersion(ctxDe(c), idDe(c), t.desde), 201);
  });
