import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { iniciarViajeSchema, cerrarViajeSchema, omitirParadaSchema } from '@afull/shared';
import { requireSesion, requireAlgunaCapacidad } from '../auth/middleware.js';
import { ipDe } from '../../lib/ip.js';
import type { Ctx } from '../clientes/service.js';
import { iniciarViaje, cerrarViaje } from './viajes.service.js';
import { cerrarParada, miDiaEnCampo } from './paradas.service.js';

const ctxDe = (c: Context): Ctx => ({ usuarioId: c.get('usuario').id, ip: ipDe(c) });
const idDe = (c: Context) => z.string().uuid().parse(c.req.param('id'));
const cuerpo = (c: Context) => c.req.json().catch(() => null);

/** Cuadrilla en la calle: montaje (o taller cuando sale). Siempre sobre la persona vinculada a la sesión. */
export const campoRoutes = new Hono()
  .use('*', requireSesion, requireAlgunaCapacidad('montaje', 'taller'))
  .get('/hoy', async (c) => c.json(await miDiaEnCampo(ctxDe(c))))
  .post('/viajes/iniciar', async (c) => {
    const r = await iniciarViaje(ctxDe(c), iniciarViajeSchema.parse(await cuerpo(c)));
    return c.json(r, r.repetido ? 200 : 201);
  })
  .post('/viajes/:id/cerrar', async (c) => c.json(await cerrarViaje(ctxDe(c), idDe(c), cerrarViajeSchema.parse(await cuerpo(c)))))
  .post('/paradas/:id/completar', async (c) => c.json(await cerrarParada(ctxDe(c), idDe(c), 'COMPLETADA')))
  .post('/paradas/:id/omitir', async (c) => {
    const b = omitirParadaSchema.parse(await cuerpo(c));
    return c.json(await cerrarParada(ctxDe(c), idDe(c), 'OMITIDA', b.motivo));
  });
