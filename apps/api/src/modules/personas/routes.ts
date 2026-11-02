import { Hono, type Context } from 'hono';
import {
  nuevaPersonaSchema,
  patchPersonaSchema,
  vincularUsuarioSchema,
  nuevaTarifaSchema,
  cerrarTarifaSchema,
  estadoConTimestampSchema,
} from '@afull/shared';
import { requireSesion, requireCapacidad } from '../auth/middleware.js';
import {
  listarPersonas,
  obtenerPersona,
  crearPersona,
  editarPersona,
  cambiarEstadoPersona,
  type Ctx,
} from './service.js';
import {
  vincularUsuario,
  listarPersonasAsignables,
} from './vinculos.service.js';
import {
  listarTarifas,
  crearTarifa,
  cerrarTarifa,
} from './tarifas.service.js';
import { paginaSchema } from '../../lib/paginacion.js';
import { ipDe } from '../../lib/ip.js';

const ctxDe = (c: Context): Ctx => ({ usuarioId: c.get('usuario').id, ip: ipDe(c) });

export const personasRoutes = new Hono()
  .use('*', requireSesion)
  // 1. Asignables ANTES de /:id, con capacidad comercial por ruta (regla de Claude Code)
  .get('/asignables', requireCapacidad('comercial'), async (c) => {
    const q = c.req.query('q');
    return c.json(await listarPersonasAsignables(q));
  })
  // 2. Gestión de personas (capacidad rrhh)
  .get('/', requireCapacidad('rrhh'), async (c) => {
    const pagina = paginaSchema.parse(c.req.query('pagina'));
    const q = c.req.query('q');
    const activoParam = c.req.query('activo');
    const activo = activoParam === undefined ? undefined : activoParam === 'true';
    return c.json(await listarPersonas({ pagina, q, activo }));
  })
  .post('/', requireCapacidad('rrhh'), async (c) => {
    const body = nuevaPersonaSchema.parse(await c.req.json().catch(() => null));
    return c.json(await crearPersona(ctxDe(c), body), 201);
  })
  // 3. Vincular usuario (capacidad admin)
  .patch('/:id/usuario', requireCapacidad('admin'), async (c) => {
    const body = vincularUsuarioSchema.parse(await c.req.json().catch(() => null));
    return c.json(await vincularUsuario(ctxDe(c), c.req.param('id'), body.usuarioId));
  })
  // 4. Detalle y edición de persona (capacidad rrhh)
  .get('/:id', requireCapacidad('rrhh'), async (c) => {
    return c.json(await obtenerPersona(c.req.param('id')));
  })
  .patch('/:id', requireCapacidad('rrhh'), async (c) => {
    const body = patchPersonaSchema.parse(await c.req.json().catch(() => null));
    return c.json(await editarPersona(ctxDe(c), c.req.param('id'), body));
  })
  .patch('/:id/estado', requireCapacidad('rrhh'), async (c) => {
    const body = estadoConTimestampSchema.parse(await c.req.json().catch(() => null));
    return c.json(await cambiarEstadoPersona(ctxDe(c), c.req.param('id'), body));
  })
  // 5. Tarifas de la persona (capacidad rrhh)
  .get('/:id/tarifas', requireCapacidad('rrhh'), async (c) => {
    return c.json(await listarTarifas(c.req.param('id')));
  })
  .post('/:id/tarifas', requireCapacidad('rrhh'), async (c) => {
    const body = nuevaTarifaSchema.parse(await c.req.json().catch(() => null));
    return c.json(await crearTarifa(ctxDe(c), c.req.param('id'), body), 201);
  });

export const tarifasRoutes = new Hono()
  .use('*', requireSesion, requireCapacidad('rrhh'))
  .patch('/:id/cerrar', async (c) => {
    const body = cerrarTarifaSchema.parse(await c.req.json().catch(() => null));
    return c.json(await cerrarTarifa(ctxDe(c), c.req.param('id'), body));
  });
