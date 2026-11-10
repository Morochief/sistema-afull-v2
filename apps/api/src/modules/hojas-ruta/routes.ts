import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { nuevaHojaRutaSchema, personaHojaRutaSchema, paradaSchema, paradasProyectoSchema } from '@afull/shared';
import { requireSesion, requireCapacidad } from '../auth/middleware.js';
import { ipDe } from '../../lib/ip.js';
import type { Ctx } from '../clientes/service.js';
import { listarHojasRuta, obtenerHojaRuta, crearHojaRuta, agregarPersona, agregarParada } from './service.js';
import { agregarProyecto } from './proyecto.service.js';

const ctxDe = (c: Context): Ctx => ({ usuarioId: c.get('usuario').id, ip: ipDe(c) });
const idDe = (c: Context) => z.string().uuid().parse(c.req.param('id'));
const cuerpo = (c: Context) => c.req.json().catch(() => null);
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();

/** Coordinación de hojas de ruta (capacidad comercial). */
export const hojasRutaRoutes = new Hono()
  .use('*', requireSesion, requireCapacidad('comercial'))
  .get('/', async (c) => c.json(await listarHojasRuta(fecha.parse(c.req.query('desde')), fecha.parse(c.req.query('hasta')))))
  .post('/', async (c) => c.json(await crearHojaRuta(ctxDe(c), nuevaHojaRutaSchema.parse(await cuerpo(c))), 201))
  .get('/:id', async (c) => c.json(await obtenerHojaRuta(idDe(c))))
  .post('/:id/personas', async (c) => c.json(await agregarPersona(ctxDe(c), idDe(c), personaHojaRutaSchema.parse(await cuerpo(c))), 201))
  .post('/:id/paradas', async (c) => c.json(await agregarParada(ctxDe(c), idDe(c), paradaSchema.parse(await cuerpo(c))), 201))
  .post('/:id/paradas-proyecto', async (c) => c.json(await agregarProyecto(ctxDe(c), idDe(c), paradasProyectoSchema.parse(await cuerpo(c))), 201));
