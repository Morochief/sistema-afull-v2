import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { anularSchema, empresaDatoSchema, filtroFacturasSchema, filtroRecibosSchema, nuevaFacturaSchema, nuevoReciboSchema } from '@afull/shared';
import { requireSesion, requireCapacidad } from '../auth/middleware.js';
import { ipDe } from '../../lib/ip.js';
import type { Ctx } from '../clientes/service.js';
import { anularFactura, crearFactura, listarFacturas, saldoCliente } from './facturas.service.js';
import { anularRecibo, crearRecibo } from './recibos.service.js';
import { guardarEmpresa, listarRecibos, obtenerEmpresa, obtenerRecibo } from './consultas.service.js';

const ctxDe = (c: Context): Ctx => ({ usuarioId: c.get('usuario').id, ip: ipDe(c) });
const idDe = (c: Context) => z.string().uuid().parse(c.req.param('id'));
const cuerpo = async (c: Context) => c.req.json().catch(() => null);

/** Loop 21: cobranzas (oficina). Los datos de aFull del encabezado los cambia solo admin. */
export const cobranzasRoutes = new Hono()
  .use('*', requireSesion, requireCapacidad('comercial'))
  .get('/empresa', async (c) => c.json(await obtenerEmpresa()))
  .put('/empresa', requireCapacidad('admin'), async (c) => c.json(await guardarEmpresa(ctxDe(c), empresaDatoSchema.parse(await cuerpo(c)))))
  .get('/facturas', async (c) => c.json(await listarFacturas(filtroFacturasSchema.parse(c.req.query()))))
  .post('/facturas', async (c) => c.json(await crearFactura(ctxDe(c), nuevaFacturaSchema.parse(await cuerpo(c))), 201))
  .post('/facturas/:id/anular', async (c) => c.json(await anularFactura(ctxDe(c), idDe(c), anularSchema.parse(await cuerpo(c)).motivo)))
  .get('/recibos', async (c) => c.json(await listarRecibos(filtroRecibosSchema.parse(c.req.query()))))
  .get('/recibos/:id', async (c) => c.json(await obtenerRecibo(idDe(c))))
  .post('/recibos', async (c) => {
    const { recibo, nuevo } = await crearRecibo(ctxDe(c), nuevoReciboSchema.parse(await cuerpo(c)));
    return c.json(recibo, nuevo ? 201 : 200);
  })
  .post('/recibos/:id/anular', async (c) => c.json(await anularRecibo(ctxDe(c), idDe(c), anularSchema.parse(await cuerpo(c)).motivo)))
  .get('/clientes/:id/saldo', async (c) => c.json(await saldoCliente(idDe(c))));
