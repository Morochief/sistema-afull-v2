import { Hono } from 'hono';
import { z } from 'zod';
import { requireSesion, requireCapacidad } from '../auth/middleware.js';
import { listarClientes, crearCliente } from './service.js';
import { paginaSchema } from '../../lib/paginacion.js';
import { ipDe } from '../../lib/ip.js';

const nuevoClienteSchema = z.object({
  nombre: z.string().trim().min(1).max(255),
  razonSocial: z.string().trim().max(255).optional(),
  ruc: z.string().trim().max(30).optional(),
  telefono: z.string().trim().max(50).optional(),
  email: z.string().trim().email().max(255).optional(),
});

const filtroSchema = z.object({
  q: z.string().trim().max(100).optional(),
  activo: z.enum(['true', 'false']).optional(),
});

export const clientesRoutes = new Hono()
  .use('*', requireSesion, requireCapacidad('comercial'))
  .get('/', async (c) => {
    const f = filtroSchema.parse(c.req.query());
    const pagina = paginaSchema.parse(c.req.query('pagina'));
    const activo = f.activo === undefined ? undefined : f.activo === 'true';
    return c.json(await listarClientes({ pagina, q: f.q, activo }));
  })
  .post('/', async (c) => {
    const body = nuevoClienteSchema.parse(await c.req.json().catch(() => null));
    const res = await crearCliente({ usuarioId: c.get('usuario').id, ip: ipDe(c) }, body);
    return c.json(res, 201);
  });
