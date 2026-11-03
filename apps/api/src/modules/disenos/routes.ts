import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { subirDisenoSchema, observarDisenoSchema } from '@afull/shared';
import { requireSesion, requireCapacidad, requireAlgunaCapacidad } from '../auth/middleware.js';
import { ipDe } from '../../lib/ip.js';
import { versionesDeOT, subirVersion, revisarVersion, pendientesDeRevision, colaDeProduccion } from './service.js';

const ctxDe = (c: Context) => ({ usuarioId: c.get('usuario').id as string, ip: ipDe(c), capacidades: c.get('usuario').capacidades as string[] });
const uuid = (c: Context, n: string) => z.string().uuid().parse(c.req.param(n));
const cuerpo = (c: Context) => c.req.json().catch(() => null);

/**
 * Diseños (Loop 7). Subir: comercial o diseno. Revisar: comercial (Sofi) o admin (Juan).
 * Cola de producción: taller (Edu) y comercial.
 */
export const disenosRoutes = new Hono()
  .use('*', requireSesion)
  .get('/ot/:otId', requireAlgunaCapacidad('comercial', 'taller', 'diseno'), async (c) => c.json(await versionesDeOT(uuid(c, 'otId'))))
  .post('/ot/:otId', requireAlgunaCapacidad('comercial', 'diseno'), async (c) =>
    c.json(await subirVersion(ctxDe(c), uuid(c, 'otId'), subirDisenoSchema.parse(await cuerpo(c))), 201)
  )
  .get('/pendientes', requireCapacidad('comercial'), async (c) => c.json(await pendientesDeRevision()))
  .get('/cola', requireAlgunaCapacidad('taller', 'comercial'), async (c) => c.json(await colaDeProduccion()))
  .post('/:id/aprobar', requireCapacidad('comercial'), async (c) => c.json(await revisarVersion(ctxDe(c), uuid(c, 'id'), true)))
  .post('/:id/observar', requireCapacidad('comercial'), async (c) => {
    const b = observarDisenoSchema.parse(await cuerpo(c));
    return c.json(await revisarVersion(ctxDe(c), uuid(c, 'id'), false, b.observacion));
  });
