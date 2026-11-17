import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { corregirHoraSchema, horasManualSchema } from '@afull/shared';
import { requireSesion, requireCapacidad } from '../auth/middleware.js';
import { ipDe } from '../../lib/ip.js';
import { cerrarConHora, corregirFin, cargarManual, tareasParaHoras } from './service.js';

const ctxDe = (c: Context) => ({ usuarioId: c.get('usuario').id as string, ip: ipDe(c) });
const id = (c: Context) => z.string().uuid().parse(c.req.param('id'));
const cuerpo = (c: Context) => c.req.json().catch(() => null);

/** Loop 13: corregir y cargar horas a mano. RR.HH. (Sofi) y admin (Juan, Gerardo): son horas que se pagan. */
export const horasRoutes = new Hono()
  .use('*', requireSesion, requireCapacidad('rrhh'))
  .get('/persona/:id/tareas', async (c) => c.json(await tareasParaHoras(id(c))))
  .post('/manual', async (c) => {
    const r = await cargarManual(ctxDe(c), horasManualSchema.parse(await cuerpo(c)));
    return c.json(r, r.repetido ? 200 : 201);
  })
  .post('/:id/cerrar', async (c) => {
    const b = corregirHoraSchema.parse(await cuerpo(c));
    return c.json(await cerrarConHora(ctxDe(c), id(c), b.horaFin, b.motivo));
  })
  .post('/:id/correccion', async (c) => {
    const b = corregirHoraSchema.parse(await cuerpo(c));
    return c.json(await corregirFin(ctxDe(c), id(c), b.horaFin, b.motivo), 201);
  });
