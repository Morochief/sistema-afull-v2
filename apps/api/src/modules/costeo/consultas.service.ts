import type { FiltroCosteo } from '@afull/shared';
import { sql } from '../../db/client.js';
import { ErrorApp } from '../../lib/errores.js';
import { TAM_PAGINA, desplazamiento, escaparLike, armarPagina } from '../../lib/paginacion.js';
import { calcularCosteo, margenSobreVenta, type Costeo } from './calculo.service.js';

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** Snapshot guardado → misma forma que el cálculo en vivo. */
function desdeSnapshot(s: Record<string, unknown>): Costeo {
  const d = (s.detalle ?? {}) as Partial<Pick<Costeo, 'mano_obra' | 'viajes' | 'alertas'>>;
  return {
    horas: Number(s.horas), mano_obra_gs: Number(s.mano_obra_gs), material_gs: Number(s.material_gs),
    desperdicio_gs: Number(s.desperdicio_gs), km: Number(s.km), km_gs: Number(s.km_gs), total_gs: Number(s.total_gs),
    monto_presupuestado_gs: n(s.monto_presupuestado_gs), margen_pct: n(s.margen_pct),
    mano_obra: d.mano_obra ?? [], viajes: d.viajes ?? [], alertas: d.alertas ?? [],
  };
}

/** Costeo de una OT: el congelado si ya cerró; si no, el cálculo a la fecha (o para una OT cerrada antes del Loop 6). */
export async function costeoDeOT(otId: string) {
  const [ot] = await sql`SELECT id, estado FROM orden_trabajo WHERE id = ${otId}`;
  if (!ot) throw new ErrorApp(404, 'OT no encontrada');
  const [s] = await sql`SELECT * FROM ot_costeo WHERE orden_trabajo_id = ${otId}`;
  if (s) return { congelado: true, congelado_at: s.created_at as string, ...desdeSnapshot(s) };
  return { congelado: false, congelado_at: null, ...(await calcularCosteo(sql, otId)) };
}

/** Consolidado de un proyecto: cada OT (congelada o a la fecha) y el margen sobre el total vendido. */
export async function costeoDeProyecto(proyectoId: string) {
  const ots = await sql`SELECT id, codigo_ot, titulo, estado FROM orden_trabajo WHERE proyecto_id = ${proyectoId} ORDER BY codigo_ot`;
  if (ots.length === 0) {
    const [py] = await sql`SELECT 1 FROM proyecto WHERE id = ${proyectoId}`;
    if (!py) throw new ErrorApp(404, 'Proyecto no encontrado');
  }
  type Fila = { id: string; codigo_ot: string; titulo: string; estado: string; congelado: boolean; mano_obra_gs: number; material_gs: number; km_gs: number; total_gs: number; monto_presupuestado_gs: number | null; margen_pct: number | null };
  const filas: Fila[] = [];
  for (const o of ots) {
    const c = await costeoDeOT(o.id);
    filas.push({
      id: o.id as string, codigo_ot: o.codigo_ot as string, titulo: o.titulo as string, estado: o.estado as string, congelado: c.congelado,
      mano_obra_gs: c.mano_obra_gs, material_gs: c.material_gs, km_gs: c.km_gs, total_gs: c.total_gs,
      monto_presupuestado_gs: c.monto_presupuestado_gs, margen_pct: c.margen_pct,
    });
  }
  const sumar = (k: 'mano_obra_gs' | 'material_gs' | 'km_gs' | 'total_gs') => filas.reduce((a, f) => a + f[k], 0);
  const venta = filas.reduce((a, f) => a + (f.monto_presupuestado_gs ?? 0), 0);
  const total = sumar('total_gs');
  return {
    ots: filas,
    mano_obra_gs: sumar('mano_obra_gs'), material_gs: sumar('material_gs'), km_gs: sumar('km_gs'), total_gs: total,
    monto_presupuestado_gs: venta, margen_pct: margenSobreVenta(venta, total),
  };
}

function donde(f: FiltroCosteo) {
  const patron = f.q?.trim() ? `%${escaparLike(f.q.trim())}%` : null;
  return sql`WHERE ${true}
    ${f.estado ? sql`AND k.estado_final = ${f.estado}` : sql``}
    ${patron ? sql`AND (o.codigo_ot ILIKE ${patron} OR o.titulo ILIKE ${patron} OR c.nombre ILIKE ${patron})` : sql``}
    ${f.desde ? sql`AND k.created_at >= (${f.desde}::date)::timestamp AT TIME ZONE 'America/Asuncion'` : sql``}
    ${f.hasta ? sql`AND k.created_at < ((${f.hasta}::date + 1)::timestamp AT TIME ZONE 'America/Asuncion')` : sql``}`;
}

/** Rentabilidad: OTs cerradas con su costeo congelado (25 por página) y los totales del filtro. */
export async function listarCosteos(f: FiltroCosteo) {
  const base = sql`FROM ot_costeo k JOIN orden_trabajo o ON o.id = k.orden_trabajo_id JOIN cliente c ON c.id = o.cliente_id ${donde(f)}`;
  const [t] = await sql`
    SELECT count(*)::int AS total, coalesce(sum(k.total_gs), 0)::text AS costo,
           coalesce(sum(k.monto_presupuestado_gs), 0)::text AS venta,
           coalesce(sum(k.total_gs) FILTER (WHERE k.monto_presupuestado_gs > 0), 0)::text AS costo_con_venta
    ${base}
  `;
  const items = await sql`
    SELECT o.id, o.codigo_ot, o.titulo, c.nombre AS cliente_nombre, k.estado_final, k.created_at AS cerrado_at,
           k.horas::float8 AS horas, k.mano_obra_gs::float8 AS mano_obra_gs, k.material_gs::float8 AS material_gs,
           k.km_gs::float8 AS km_gs, k.total_gs::float8 AS total_gs,
           k.monto_presupuestado_gs::float8 AS monto_presupuestado_gs, k.margen_pct::float8 AS margen_pct
    ${base}
    ORDER BY k.created_at DESC, k.id LIMIT ${TAM_PAGINA} OFFSET ${desplazamiento(f.pagina)}
  `;
  const venta = Number(t.venta);
  return {
    ...armarPagina([...items], t.total, f.pagina),
    resumen: {
      // Costo de las OTs con venta (el que se compara contra lo vendido) y aparte el de las OTs sin monto.
      costo_gs: Number(t.costo_con_venta), venta_gs: venta,
      costo_sin_venta_gs: Number(t.costo) - Number(t.costo_con_venta),
      // El margen global solo considera OTs con venta (una OT sin monto no tiene margen).
      margen_pct: margenSobreVenta(venta, Number(t.costo_con_venta)),
    },
  };
}
