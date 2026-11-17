import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { requireSesion, requireCapacidad } from '../auth/middleware.js';
import { listarRegistros, todosLosRegistros, type Filtro } from './registros.service.js';
import { horasParaPagar, detalleHoras } from './horas.service.js';
import { preFactura } from './prefactura.service.js';
import { excelHoras, excelRegistros } from './excel.js';

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha AAAA-MM-DD');
const filtroSchema = z.object({
  desde: fecha, hasta: fecha,
  clienteId: z.string().uuid().optional(), proyectoId: z.string().uuid().optional(), personaId: z.string().uuid().optional(),
  concepto: z.enum(['MO', 'INSUMO', 'VEHICULO']).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
});
const rangoSchema = z.object({ desde: fecha, hasta: fecha });
const prefacturaSchema = z.object({ proyectoId: z.string().uuid().optional(), clienteId: z.string().uuid().optional(), desde: fecha.optional(), hasta: fecha.optional() });
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const archivo = (c: Context, buf: Buffer, nombre: string) =>
  c.body(new Uint8Array(buf), 200, { 'Content-Type': XLSX, 'Content-Disposition': `attachment; filename="${nombre}"`, 'Cache-Control': 'no-store' });

/** Loop 20: reportes. Registros y pre-factura: oficina (comercial). Horas para pagar: RR.HH. (admin pasa siempre). */
export const reportesRoutes = new Hono()
  .use('*', requireSesion)
  .get('/registros', requireCapacidad('comercial'), async (c) => {
    const f = filtroSchema.parse(c.req.query());
    return c.json(await listarRegistros(f as Filtro, f.pagina));
  })
  .get('/registros.xlsx', requireCapacidad('comercial'), async (c) => {
    const f = filtroSchema.parse(c.req.query());
    return archivo(c, await excelRegistros(await todosLosRegistros(f as Filtro)), `registros_${f.desde}_${f.hasta}.xlsx`);
  })
  .get('/horas', requireCapacidad('rrhh'), async (c) => {
    const f = rangoSchema.parse(c.req.query());
    return c.json({ items: await horasParaPagar(f.desde, f.hasta) });
  })
  .get('/horas.xlsx', requireCapacidad('rrhh'), async (c) => {
    const f = rangoSchema.parse(c.req.query());
    return archivo(c, await excelHoras(await horasParaPagar(f.desde, f.hasta), await detalleHoras(f.desde, f.hasta)), `horas_${f.desde}_${f.hasta}.xlsx`);
  })
  .get('/prefactura', requireCapacidad('comercial'), async (c) => c.json(await preFactura(prefacturaSchema.parse(c.req.query()))));
