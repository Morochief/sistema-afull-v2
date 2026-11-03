import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { nuevaSedeSchema, patchSedeSchema, nuevoVehiculoSchema, patchVehiculoSchema } from '@afull/shared';
import type { TransactionSql } from 'postgres';
import { sql } from '../../db/client.js';
import { puedeVerCostos } from '@afull/shared';
import { requireSesion, requireCapacidad, requireAlgunaCapacidad } from '../auth/middleware.js';
import { auditar } from '../auditoria/service.js';
import { ErrorApp, traducirErrorPg } from '../../lib/errores.js';
import { ipDe } from '../../lib/ip.js';

const idDe = (c: Context) => z.string().uuid().parse(c.req.param('id'));
const cuerpo = (c: Context) => c.req.json().catch(() => null);

async function conAuditoria<T>(c: Context, accion: string, recurso: string, fn: (tx: TransactionSql) => Promise<T & { id: string }>) {
  try {
    return await sql.begin(async (tx) => {
      const r = await fn(tx);
      await auditar({ usuarioId: c.get('usuario').id, accion, recurso, recursoId: r.id, ip: ipDe(c) }, tx);
      return r;
    });
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}

const COL_VEHICULO = sql`id, chapa, marca_modelo, costo_km_gs::float8 AS costo_km_gs, activo, created_at, updated_at`;
const COL_SEDE = sql`id, nombre, gps_lat::float8 AS gps_lat, gps_lng::float8 AS gps_lng, radio_m, activo, created_at, updated_at`;

/** Vehículos y sedes: catálogos chicos (sin paginación). Lectura para coordinación y cuadrilla; alta y edición solo admin. */
export const flotaRoutes = new Hono()
  .use('*', requireSesion)
  .get('/vehiculos', requireAlgunaCapacidad('comercial', 'montaje', 'taller'), async (c) => {
    const lista = [...(await sql`SELECT ${COL_VEHICULO} FROM vehiculo ORDER BY activo DESC, chapa`)];
    // La cuadrilla elige el vehículo sin ver el costo por km (solo admin y comercial).
    return c.json(puedeVerCostos(c.get('usuario').capacidades as string[]) ? lista : lista.map(({ costo_km_gs: _c, ...v }) => v));
  })
  .post('/vehiculos', requireCapacidad('admin'), async (c) => {
    const d = nuevoVehiculoSchema.parse(await cuerpo(c));
    const r = await conAuditoria(c, 'vehiculo.crear', 'vehiculo', async (tx) => {
      const [v] = await tx`
        INSERT INTO vehiculo (chapa, marca_modelo, costo_km_gs) VALUES (${d.chapa}, ${d.marcaModelo}, ${d.costoKmGs})
        RETURNING ${COL_VEHICULO}
      `;
      return v as { id: string };
    });
    return c.json(r, 201);
  })
  .patch('/vehiculos/:id', requireCapacidad('admin'), async (c) => {
    const id = idDe(c);
    const d = patchVehiculoSchema.parse(await cuerpo(c));
    return c.json(
      await conAuditoria(c, 'vehiculo.editar', 'vehiculo', async (tx) => {
        const [a] = await tx`SELECT * FROM vehiculo WHERE id = ${id} FOR UPDATE`;
        if (!a) throw new ErrorApp(404, 'Vehículo no encontrado');
        const [v] = await tx`
          UPDATE vehiculo SET marca_modelo = ${d.marcaModelo ?? a.marca_modelo}, costo_km_gs = ${d.costoKmGs ?? a.costo_km_gs},
                 activo = ${d.activo ?? a.activo}
          WHERE id = ${id} RETURNING ${COL_VEHICULO}
        `;
        return v as { id: string };
      })
    );
  })
  .get('/sedes', async (c) => c.json([...(await sql`SELECT ${COL_SEDE} FROM sede ORDER BY activo DESC, nombre`)]))
  .post('/sedes', requireCapacidad('admin'), async (c) => {
    const d = nuevaSedeSchema.parse(await cuerpo(c));
    const r = await conAuditoria(c, 'sede.crear', 'sede', async (tx) => {
      const [s] = await tx`
        INSERT INTO sede (nombre, gps_lat, gps_lng, radio_m) VALUES (${d.nombre}, ${d.gpsLat}, ${d.gpsLng}, ${d.radioM})
        RETURNING ${COL_SEDE}
      `;
      return s as { id: string };
    });
    return c.json(r, 201);
  })
  .patch('/sedes/:id', requireCapacidad('admin'), async (c) => {
    const id = idDe(c);
    const d = patchSedeSchema.parse(await cuerpo(c));
    return c.json(
      await conAuditoria(c, 'sede.editar', 'sede', async (tx) => {
        const [a] = await tx`SELECT * FROM sede WHERE id = ${id} FOR UPDATE`;
        if (!a) throw new ErrorApp(404, 'Sede no encontrada');
        const [s] = await tx`
          UPDATE sede SET nombre = ${d.nombre ?? a.nombre}, gps_lat = ${d.gpsLat ?? a.gps_lat}, gps_lng = ${d.gpsLng ?? a.gps_lng},
                 radio_m = ${d.radioM ?? a.radio_m}, activo = ${d.activo ?? a.activo}
          WHERE id = ${id} RETURNING ${COL_SEDE}
        `;
        return s as { id: string };
      })
    );
  });
