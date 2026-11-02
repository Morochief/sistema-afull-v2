import { sql } from '../../db/client.js';
import { auditar } from '../auditoria/service.js';
import { ErrorApp, traducirErrorPg } from '../../lib/errores.js';
import { type Ctx, esperarAvanceReloj, verificarUpdatedAt } from './service.js';

export type NuevaSucursal = { nombre: string; ciudad?: string; direccion?: string; gpsLat: number; gpsLng: number };
export type PatchSucursal = {
  nombre?: string;
  ciudad?: string | null;
  direccion?: string | null;
  gpsLat?: number;
  gpsLng?: number;
  updatedAt: string;
};

export async function crearSucursal(ctx: Ctx, clienteId: string, d: NuevaSucursal) {
  try {
    return await sql.begin(async (tx) => {
      const [c] = await tx`SELECT id FROM cliente WHERE id = ${clienteId}`;
      if (!c) throw new ErrorApp(404, 'Cliente no encontrado');
      const [s] = await tx`
        INSERT INTO sucursal (cliente_id, nombre, ciudad, direccion, gps_lat, gps_lng)
        VALUES (${clienteId}, ${d.nombre}, ${d.ciudad ?? null}, ${d.direccion ?? null}, ${d.gpsLat}, ${d.gpsLng})
        RETURNING *
      `;
      await auditar(
        { usuarioId: ctx.usuarioId, accion: 'sucursal.crear', recurso: 'sucursal', recursoId: s.id, ip: ctx.ip, metadata: { clienteId, nombre: d.nombre } },
        tx,
      );
      return s;
    });
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}

export async function editarSucursal(ctx: Ctx, clienteId: string, sucId: string, d: PatchSucursal) {
  await esperarAvanceReloj(d.updatedAt);
  try {
    return await sql.begin(async (tx) => {
      const [actual] = await tx`SELECT * FROM sucursal WHERE id = ${sucId} AND cliente_id = ${clienteId} FOR UPDATE`;
      if (!actual) throw new ErrorApp(404, 'Sucursal no encontrada');
      verificarUpdatedAt(actual.updated_at, d.updatedAt);

      const nombre = d.nombre ?? actual.nombre;
      const ciudad = d.ciudad === undefined ? actual.ciudad : d.ciudad;
      const direccion = d.direccion === undefined ? actual.direccion : d.direccion;
      const gpsLat = d.gpsLat ?? actual.gps_lat;
      const gpsLng = d.gpsLng ?? actual.gps_lng;

      const [s] = await tx`
        UPDATE sucursal
        SET nombre = ${nombre}, ciudad = ${ciudad}, direccion = ${direccion}, gps_lat = ${gpsLat}, gps_lng = ${gpsLng}
        WHERE id = ${sucId} AND cliente_id = ${clienteId}
        RETURNING *
      `;
      await auditar(
        { usuarioId: ctx.usuarioId, accion: 'sucursal.editar', recurso: 'sucursal', recursoId: sucId, ip: ctx.ip, metadata: { clienteId, nombre } },
        tx,
      );
      return s;
    });
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}

export async function cambiarEstadoSucursal(
  ctx: Ctx,
  clienteId: string,
  sucId: string,
  d: { activo: boolean; updatedAt: string },
) {
  await esperarAvanceReloj(d.updatedAt);
  try {
    return await sql.begin(async (tx) => {
      const [actual] = await tx`SELECT id, updated_at FROM sucursal WHERE id = ${sucId} AND cliente_id = ${clienteId} FOR UPDATE`;
      if (!actual) throw new ErrorApp(404, 'Sucursal no encontrada');
      verificarUpdatedAt(actual.updated_at, d.updatedAt);

      const [s] = await tx`
        UPDATE sucursal SET activo = ${d.activo} WHERE id = ${sucId} AND cliente_id = ${clienteId} RETURNING *
      `;
      const accion = d.activo ? 'sucursal.reactivar' : 'sucursal.desactivar';
      await auditar(
        { usuarioId: ctx.usuarioId, accion, recurso: 'sucursal', recursoId: sucId, ip: ctx.ip, metadata: { clienteId, activo: d.activo } },
        tx,
      );
      return s;
    });
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}
