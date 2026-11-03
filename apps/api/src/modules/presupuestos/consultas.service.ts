import { sql } from '../../db/client.js';
import type { EstadoPresupuesto, Pagina, PresupuestoDetalle, PresupuestoFila } from '@afull/shared';
import { ErrorApp, traducirErrorPg } from '../../lib/errores.js';
import { TAM_PAGINA, desplazamiento, escaparLike, armarPagina } from '../../lib/paginacion.js';

export type FiltroPresupuestos = {
  pagina: number;
  q?: string;
  estado?: EstadoPresupuesto;
  clienteId?: string;
  desde?: string;
  hasta?: string;
};

// NUMERIC y BIGINT llegan como string con postgres-js: para la respuesta JSON se convierten a
// float8 (exacto para 4 decimales y para guaraníes < 2^53). Los CÁLCULOS no usan estas columnas:
// leen los valores como texto (ver transiciones.service.ts).
export const COLUMNAS_PRESUPUESTO = sql`
  p.id, p.numero, p.version, p.cliente_id, c.nombre AS cliente_nombre, p.titulo, p.notas,
  p.margen_pct::float8 AS margen_pct, p.validez_dias, p.estado, p.total_gs::float8 AS total_gs, p.iva_gs::float8 AS iva_gs, p.precio_final_gs::float8 AS precio_final_gs,
  p.enviado_at, p.creado_por, p.created_at, p.updated_at`;

function donde(f: FiltroPresupuestos) {
  const patron = f.q?.trim() ? `%${escaparLike(f.q.trim())}%` : null;
  return sql`WHERE ${true}
    ${f.estado ? sql`AND p.estado = ${f.estado}` : sql``}
    ${f.clienteId ? sql`AND p.cliente_id = ${f.clienteId}` : sql``}
    ${patron ? sql`AND (p.numero ILIKE ${patron} OR p.titulo ILIKE ${patron} OR c.nombre ILIKE ${patron})` : sql``}
    ${f.desde ? sql`AND p.created_at >= (${f.desde}::date)::timestamp AT TIME ZONE 'America/Asuncion'` : sql``}
    ${f.hasta ? sql`AND p.created_at < ((${f.hasta}::date + 1)::timestamp AT TIME ZONE 'America/Asuncion')` : sql``}`;
}

export async function listarPresupuestos(f: FiltroPresupuestos): Promise<Pagina<PresupuestoFila>> {
  try {
    const [{ total }] = await sql`
      SELECT count(*)::int AS total FROM presupuesto p JOIN cliente c ON c.id = p.cliente_id ${donde(f)}
    `;
    const items = await sql`
      SELECT ${COLUMNAS_PRESUPUESTO}
      FROM presupuesto p JOIN cliente c ON c.id = p.cliente_id
      ${donde(f)}
      ORDER BY p.created_at DESC, p.id LIMIT ${TAM_PAGINA} OFFSET ${desplazamiento(f.pagina)}
    `;
    return armarPagina([...items], total, f.pagina) as Pagina<PresupuestoFila>;
  } catch (e) {
    traducirErrorPg(e);
  }
}

export async function obtenerPresupuesto(id: string): Promise<PresupuestoDetalle> {
  try {
    const [p] = await sql`
      SELECT ${COLUMNAS_PRESUPUESTO} FROM presupuesto p JOIN cliente c ON c.id = p.cliente_id WHERE p.id = ${id}
    `;
    if (!p) throw new ErrorApp(404, 'Presupuesto no encontrado');
    const items = await sql`
      SELECT i.id, i.presupuesto_id, i.cliente_id, i.sucursal_id, s.nombre AS sucursal_nombre, i.orden,
             i.concepto, i.descripcion, i.cantidad::float8 AS cantidad, i.unidad,
             i.precio_unitario_gs::float8 AS precio_unitario_gs,
             (i.cantidad * i.precio_unitario_gs)::float8 AS subtotal_gs,
             i.activo, i.created_at, i.updated_at
      FROM presupuesto_item i LEFT JOIN sucursal s ON s.id = i.sucursal_id
      WHERE i.presupuesto_id = ${id}
      ORDER BY i.orden, i.created_at, i.id
    `;
    const eventos = await sql`
      SELECT e.id, e.presupuesto_id, e.estado_anterior, e.estado_nuevo, e.autor_id,
             u.username AS autor_nombre, e.comentario, e.created_at
      FROM presupuesto_evento e JOIN usuario u ON u.id = e.autor_id
      WHERE e.presupuesto_id = ${id}
      ORDER BY e.created_at, e.id
    `;
    const versiones = await sql`
      SELECT id, version, estado, total_gs::float8 AS total_gs, created_at
      FROM presupuesto WHERE numero = ${p.numero as string} ORDER BY version
    `;
    return { ...p, items: [...items], eventos: [...eventos], versiones: [...versiones] } as unknown as PresupuestoDetalle;
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}
