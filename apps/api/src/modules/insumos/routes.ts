import { Hono, type Context } from 'hono';
import { z } from 'zod';
import {
  nuevoInsumoSchema, patchInsumoSchema, nuevoPrecioSchema, consumoSchema, mermaSchema, compartidoSchema, anularConsumoSchema,
} from '@afull/shared';
import { requireSesion, requireCapacidad, requireAlgunaCapacidad } from '../auth/middleware.js';
import { ipDe } from '../../lib/ip.js';
import { buscarInsumos, crearInsumo, editarInsumo, nuevoPrecio } from './catalogo.service.js';
import { registrarConsumo, registrarMerma, registrarCompartido, anularConsumo, consumosDeOT } from './consumos.service.js';

const ctxDe = (c: Context) => ({ usuarioId: c.get('usuario').id as string, ip: ipDe(c), capacidades: c.get('usuario').capacidades as string[] });
const idDe = (c: Context, n = 'id') => z.string().uuid().parse(c.req.param(n));
const cuerpo = (c: Context) => c.req.json().catch(() => null);
const QUIEN_USA = ['taller', 'montaje', 'diseno', 'comercial'] as const;

/** Catálogo de insumos: lo consultan quienes cargan material; lo administra admin (precios con historial). */
export const insumosRoutes = new Hono()
  .use('*', requireSesion)
  .get('/', requireAlgunaCapacidad(...QUIEN_USA), async (c) =>
    c.json(await buscarInsumos(c.req.query('q'), c.req.query('sector'), c.req.query('todos') === 'true'))
  )
  .post('/', requireCapacidad('admin'), async (c) => c.json(await crearInsumo(ctxDe(c), nuevoInsumoSchema.parse(await cuerpo(c))), 201))
  .patch('/:id', requireCapacidad('admin'), async (c) => c.json(await editarInsumo(ctxDe(c), idDe(c), patchInsumoSchema.parse(await cuerpo(c)))))
  .post('/:id/precios', requireCapacidad('admin'), async (c) =>
    c.json(await nuevoPrecio(ctxDe(c), idDe(c), nuevoPrecioSchema.parse(await cuerpo(c)).costoUnitarioGs), 201)
  );

/** Consumos: cada operario carga lo que usó; no hay stock. Inmutables: se corrigen con un negativo. */
export const consumosRoutes = new Hono()
  .use('*', requireSesion, requireAlgunaCapacidad(...QUIEN_USA))
  .get('/ot/:otId', async (c) => c.json(await consumosDeOT(idDe(c, 'otId'))))
  .post('/', async (c) => {
    const r = await registrarConsumo(ctxDe(c), consumoSchema.parse(await cuerpo(c)));
    return c.json(r, r.repetido ? 200 : 201);
  })
  .post('/merma', async (c) => {
    const r = await registrarMerma(ctxDe(c), mermaSchema.parse(await cuerpo(c)));
    return c.json(r, r.repetido ? 200 : 201);
  })
  .post('/compartido', async (c) => {
    const r = await registrarCompartido(ctxDe(c), compartidoSchema.parse(await cuerpo(c)));
    return c.json(r, r.repetido ? 200 : 201);
  })
  .post('/:id/anular', async (c) => {
    const b = anularConsumoSchema.parse(await cuerpo(c));
    const r = await anularConsumo(ctxDe(c), idDe(c), b.motivo, b.claveIdempotencia);
    return c.json(r, r.repetido ? 200 : 201);
  });
