import { Hono, type Context } from 'hono';
import {
  nuevoClienteSchema,
  patchClienteSchema,
  estadoConTimestampSchema,
  estadoSimpleSchema,
  filtroClienteSchema,
  sucursalSchema,
  patchSucursalSchema,
  contactoSchema,
  patchContactoSchema,
  marcaSchema,
  patchMarcaSchema,
} from '@afull/shared';
import { requireSesion, requireCapacidad } from '../auth/middleware.js';
import {
  listarClientes,
  obtenerDetalleCliente,
  crearCliente,
  editarCliente,
  cambiarEstadoCliente,
  type Ctx,
} from './service.js';
import {
  crearSucursal,
  editarSucursal,
  cambiarEstadoSucursal,
} from './sucursales.service.js';
import {
  crearContacto,
  editarContacto,
  cambiarEstadoContacto,
  crearMarca,
  editarMarca,
  cambiarEstadoMarca,
} from './subrecursos.service.js';
import { paginaSchema } from '../../lib/paginacion.js';
import { ipDe } from '../../lib/ip.js';

const ctxDe = (c: Context): Ctx => ({ usuarioId: c.get('usuario').id, ip: ipDe(c) });

export const clientesRoutes = new Hono()
  .use('*', requireSesion, requireCapacidad('comercial'))
  .get('/', async (c) => {
    const f = filtroClienteSchema.parse(c.req.query());
    const pagina = paginaSchema.parse(c.req.query('pagina'));
    const activo = f.activo === undefined ? undefined : f.activo === 'true';
    return c.json(await listarClientes({ pagina, q: f.q, activo, desde: f.desde, hasta: f.hasta }));
  })
  .post('/', async (c) => {
    const body = nuevoClienteSchema.parse(await c.req.json().catch(() => null));
    return c.json(await crearCliente(ctxDe(c), body), 201);
  })
  .get('/:id', async (c) => {
    return c.json(await obtenerDetalleCliente(c.req.param('id')));
  })
  .patch('/:id', async (c) => {
    const body = patchClienteSchema.parse(await c.req.json().catch(() => null));
    return c.json(await editarCliente(ctxDe(c), c.req.param('id'), body));
  })
  .patch('/:id/estado', async (c) => {
    const body = estadoConTimestampSchema.parse(await c.req.json().catch(() => null));
    return c.json(await cambiarEstadoCliente(ctxDe(c), c.req.param('id'), body));
  })
  .post('/:clienteId/sucursales', async (c) => {
    const body = sucursalSchema.parse(await c.req.json().catch(() => null));
    return c.json(await crearSucursal(ctxDe(c), c.req.param('clienteId'), body), 201);
  })
  .patch('/:clienteId/sucursales/:sucId', async (c) => {
    const body = patchSucursalSchema.parse(await c.req.json().catch(() => null));
    return c.json(await editarSucursal(ctxDe(c), c.req.param('clienteId'), c.req.param('sucId'), body));
  })
  .patch('/:clienteId/sucursales/:sucId/estado', async (c) => {
    const body = estadoConTimestampSchema.parse(await c.req.json().catch(() => null));
    return c.json(await cambiarEstadoSucursal(ctxDe(c), c.req.param('clienteId'), c.req.param('sucId'), body));
  })
  .post('/:clienteId/contactos', async (c) => {
    const body = contactoSchema.parse(await c.req.json().catch(() => null));
    return c.json(await crearContacto(ctxDe(c), c.req.param('clienteId'), body), 201);
  })
  .patch('/:clienteId/contactos/:contactoId', async (c) => {
    const body = patchContactoSchema.parse(await c.req.json().catch(() => null));
    return c.json(await editarContacto(ctxDe(c), c.req.param('clienteId'), c.req.param('contactoId'), body));
  })
  .patch('/:clienteId/contactos/:contactoId/estado', async (c) => {
    const body = estadoSimpleSchema.parse(await c.req.json().catch(() => null));
    return c.json(
      await cambiarEstadoContacto(ctxDe(c), c.req.param('clienteId'), c.req.param('contactoId'), body.activo),
    );
  })
  .post('/:clienteId/marcas', async (c) => {
    const body = marcaSchema.parse(await c.req.json().catch(() => null));
    return c.json(await crearMarca(ctxDe(c), c.req.param('clienteId'), body), 201);
  })
  .patch('/:clienteId/marcas/:marcaId', async (c) => {
    const body = patchMarcaSchema.parse(await c.req.json().catch(() => null));
    return c.json(await editarMarca(ctxDe(c), c.req.param('clienteId'), c.req.param('marcaId'), body));
  })
  .patch('/:clienteId/marcas/:marcaId/estado', async (c) => {
    const body = estadoSimpleSchema.parse(await c.req.json().catch(() => null));
    return c.json(await cambiarEstadoMarca(ctxDe(c), c.req.param('clienteId'), c.req.param('marcaId'), body.activo));
  });
