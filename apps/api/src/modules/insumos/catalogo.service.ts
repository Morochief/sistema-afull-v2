import { sql } from '../../db/client.js';
import { auditar } from '../auditoria/service.js';
import { ErrorApp, traducirErrorPg } from '../../lib/errores.js';
import { escaparLike } from '../../lib/paginacion.js';
import type { Ctx } from '../clientes/service.js';

/** Insumo con su precio vigente (el último del historial). */
const SELECT_INSUMO = sql`
  SELECT i.id, i.nombre, i.unidad, i.sector, i.activo, pr.costo_unitario_gs::float8 AS costo_unitario_gs, pr.vigente_desde
  FROM insumo i
  LEFT JOIN LATERAL (
    SELECT costo_unitario_gs, vigente_desde FROM insumo_precio p WHERE p.insumo_id = i.id ORDER BY vigente_desde DESC, id DESC LIMIT 1
  ) pr ON true`;

export async function buscarInsumos(q?: string, sector?: string, incluirInactivos = false) {
  const patron = q?.trim() ? `%${escaparLike(q.trim())}%` : null;
  return [
    ...(await sql`
      ${SELECT_INSUMO}
      WHERE ${true}
        ${incluirInactivos ? sql`` : sql`AND i.activo`}
        ${patron ? sql`AND i.nombre ILIKE ${patron}` : sql``}
        ${sector ? sql`AND i.sector = ${sector}` : sql``}
      ORDER BY i.activo DESC, i.nombre LIMIT 50
    `),
  ];
}

export async function crearInsumo(ctx: Ctx, d: { nombre: string; unidad: string; sector?: string; costoUnitarioGs: number }) {
  try {
    return await sql.begin(async (tx) => {
      const [i] = await tx`INSERT INTO insumo (nombre, unidad, sector) VALUES (${d.nombre}, ${d.unidad}, ${d.sector ?? null}) RETURNING id`;
      await tx`INSERT INTO insumo_precio (insumo_id, costo_unitario_gs, cargado_por) VALUES (${i.id}, ${d.costoUnitarioGs}, ${ctx.usuarioId})`;
      await auditar({ usuarioId: ctx.usuarioId, accion: 'insumo.crear', recurso: 'insumo', recursoId: i.id, ip: ctx.ip, metadata: { nombre: d.nombre } }, tx);
      return i as { id: string };
    });
  } catch (e) {
    if ((e as { code?: string }).code === '23505') throw new ErrorApp(409, 'Ya existe un insumo con ese nombre y unidad');
    traducirErrorPg(e);
  }
}

export async function editarInsumo(ctx: Ctx, id: string, d: { nombre?: string; sector?: string | null; activo?: boolean }) {
  try {
    return await sql.begin(async (tx) => {
      const [a] = await tx`SELECT * FROM insumo WHERE id = ${id} FOR UPDATE`;
      if (!a) throw new ErrorApp(404, 'Insumo no encontrado');
      const [i] = await tx`
        UPDATE insumo SET nombre = ${d.nombre ?? a.nombre}, sector = ${d.sector === undefined ? a.sector : d.sector}, activo = ${d.activo ?? a.activo}
        WHERE id = ${id} RETURNING id
      `;
      await auditar({ usuarioId: ctx.usuarioId, accion: 'insumo.editar', recurso: 'insumo', recursoId: id, ip: ctx.ip, metadata: d }, tx);
      return i as { id: string };
    });
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    if ((e as { code?: string }).code === '23505') throw new ErrorApp(409, 'Ya existe un insumo con ese nombre y unidad');
    traducirErrorPg(e);
  }
}

/** Precio nuevo: se agrega al historial; los consumos ya cargados conservan su costo. */
export async function nuevoPrecio(ctx: Ctx, id: string, costo: number) {
  try {
    return await sql.begin(async (tx) => {
      const [a] = await tx`SELECT id FROM insumo WHERE id = ${id}`;
      if (!a) throw new ErrorApp(404, 'Insumo no encontrado');
      const [p] = await tx`INSERT INTO insumo_precio (insumo_id, costo_unitario_gs, cargado_por) VALUES (${id}, ${costo}, ${ctx.usuarioId}) RETURNING id`;
      await auditar({ usuarioId: ctx.usuarioId, accion: 'insumo.precio', recurso: 'insumo', recursoId: id, ip: ctx.ip, metadata: { costo } }, tx);
      return p as { id: string };
    });
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}
