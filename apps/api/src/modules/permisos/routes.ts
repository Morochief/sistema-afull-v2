import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { nuevaSolicitudPermisoSchema, transicionPermisoSchema, filtroPermisosSchema } from '@afull/shared';
import { requireSesion } from '../auth/middleware.js';
import { ipDe } from '../../lib/ip.js';
import { crearSolicitud, transicionarSolicitud, type CtxPermiso } from './mutaciones.service.js';
import { listarSolicitudes, obtenerSolicitud } from './consultas.service.js';

const ctxDe = (c: Context): CtxPermiso => ({ usuarioId: c.get('usuario').id, ip: ipDe(c), capacidades: c.get('usuario').capacidades });
const idDe = (c: Context) => z.string().uuid().parse(c.req.param('id'));
const cuerpo = (c: Context) => c.req.json().catch(() => null);

/** Solicitudes de permiso (Loop 8). Cualquiera con sesión pide; el alcance y las firmas se controlan en el servicio. */
export const permisosRoutes = new Hono()
  .use('*', requireSesion)
  .get('/', async (c) => c.json(await listarSolicitudes(ctxDe(c), filtroPermisosSchema.parse(c.req.query()))))
  .get('/:id', async (c) => c.json(await obtenerSolicitud(ctxDe(c), idDe(c))))
  .post('/', async (c) => {
    const r = await crearSolicitud(ctxDe(c), nuevaSolicitudPermisoSchema.parse(await cuerpo(c)));
    return c.json(r, r.repetida ? 200 : 201);
  })
  .post('/:id/transicionar', async (c) => c.json(await transicionarSolicitud(ctxDe(c), idDe(c), transicionPermisoSchema.parse(await cuerpo(c)))));
