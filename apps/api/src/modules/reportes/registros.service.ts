import { sql } from '../../db/client.js';
import { ErrorApp } from '../../lib/errores.js';

/**
 * Loop 20: los "registros" del Excel de Juan, armados desde los eventos (nada se guarda aparte):
 * - MO: cada tramo del reloj imputado a su OT (`v_mano_obra`: hora efectiva del Loop 13 y fracción de tanda del Loop 12),
 *   a la tarifa vigente ese día; precio unitario por minuto (tarifa / 60), como el Excel (350 Gs/min).
 * - Insumo: cada línea de `consumo_insumo` (las correcciones en negativo).
 * - Vehículo: la parte de cada viaje cerrado que le toca a la OT (km ÷ OTs no omitidas de la salida, igual que el costeo).
 * Cada fila se redondea a Gs.
 */
export type Filtro = { desde?: string; hasta?: string; clienteId?: string; proyectoId?: string; personaId?: string; concepto?: 'MO' | 'INSUMO' | 'VEHICULO' };
export type FilaRegistro = {
  fecha: string; proyecto: string | null; ot_id: string; ot_codigo: string; cliente: string; concepto: 'MO' | 'Insumo' | 'Vehículo';
  descripcion: string; hs_inicio: string | null; hs_fin: string | null; cantidad: number; unidad: string; precio_unitario: number; total_gs: number;
  persona_id: string | null; persona: string | null;
};

const TZ = 'America/Asuncion';
const MAX_DIAS = 366;

export function validarRango(desde?: string, hasta?: string) {
  if (!desde || !hasta) return;
  const dias = (Date.parse(hasta) - Date.parse(desde)) / 86_400_000;
  if (!(dias >= 0)) throw new ErrorApp(400, '"Desde" tiene que ser anterior a "Hasta"');
  if (dias > MAX_DIAS) throw new ErrorApp(400, `El período no puede pasar de ${MAX_DIAS} días`);
}

/** La consulta base (UNION de los tres conceptos) con los filtros; se reusa para la página, los totales y el Excel. */
export function baseRegistros(f: Filtro) {
  const rango = (col: ReturnType<typeof sql>) => sql`
    ${f.desde ? sql`AND ${col} >= ${f.desde}::date` : sql``} ${f.hasta ? sql`AND ${col} <= ${f.hasta}::date` : sql``}`;
  const deOT = sql`
    ${f.clienteId ? sql`AND o.cliente_id = ${f.clienteId}` : sql``} ${f.proyectoId ? sql`AND o.proyecto_id = ${f.proyectoId}` : sql``}`;
  const quiere = (c: Filtro['concepto']) => !f.concepto || f.concepto === c;
  const proyecto = sql`(SELECT py.codigo || ' · ' || py.nombre FROM proyecto py WHERE py.id = o.proyecto_id)`;

  const mo = sql`
    SELECT (v.hora_inicio AT TIME ZONE ${TZ})::date::text AS fecha, v.hora_inicio AS ts, ${proyecto} AS proyecto, o.id AS ot_id, o.codigo_ot AS ot_codigo,
           c.nombre AS cliente, 'MO' AS concepto,
           p.nombre || ' · ' || t.descripcion
             || CASE WHEN v.tanda_id IS NOT NULL THEN ' (tanda ' || replace(trim_scale(v.peso)::text, '.', ',') || ' de ' || replace(trim_scale(v.peso_total)::text, '.', ',') || ' m²)' ELSE '' END
             || CASE WHEN vt.origen = 'MANUAL' THEN ' (a mano)' ELSE '' END
             || CASE WHEN vt.hora_fin <> vt.hora_fin_original OR vt.cerrado_por IS NOT NULL THEN ' (corregido)' ELSE '' END AS descripcion,
           to_char(v.hora_inicio AT TIME ZONE ${TZ}, 'HH24:MI') AS hs_inicio, to_char(vt.hora_fin AT TIME ZONE ${TZ}, 'HH24:MI') AS hs_fin,
           round((v.segundos * v.peso / v.peso_total / 60)::numeric, 2)::float8 AS cantidad, 'min' AS unidad,
           round(coalesce(tf.tarifa_hora_gs, 0) / 60, 4)::float8 AS precio_unitario,
           round((v.segundos * v.peso / v.peso_total / 3600 * coalesce(tf.tarifa_hora_gs, 0))::numeric)::float8 AS total_gs,
           p.id AS persona_id, p.nombre AS persona
    FROM v_mano_obra v JOIN v_tramo vt ON vt.id = v.intervalo_id JOIN tarea t ON t.id = v.tarea_id
    JOIN orden_trabajo o ON o.id = v.orden_trabajo_id JOIN cliente c ON c.id = o.cliente_id JOIN persona p ON p.id = v.persona_id
    LEFT JOIN tarifa_persona tf ON tf.persona_id = v.persona_id
      AND (v.hora_inicio AT TIME ZONE ${TZ})::date BETWEEN tf.fecha_inicio AND coalesce(tf.fecha_fin, 'infinity'::date)
    WHERE true ${rango(sql`(v.hora_inicio AT TIME ZONE ${TZ})::date`)} ${deOT} ${f.personaId ? sql`AND v.persona_id = ${f.personaId}` : sql``}`;

  const insumo = sql`
    SELECT (ci.created_at AT TIME ZONE ${TZ})::date::text AS fecha, ci.created_at AS ts, ${proyecto} AS proyecto, o.id AS ot_id, o.codigo_ot AS ot_codigo,
           c.nombre AS cliente, 'Insumo' AS concepto,
           i.nombre || CASE WHEN ci.es_desperdicio THEN ' (desperdicio)' ELSE '' END || CASE WHEN ci.corrige_id IS NOT NULL THEN ' (corrección)' ELSE '' END AS descripcion,
           NULL AS hs_inicio, NULL AS hs_fin, ci.cantidad::float8 AS cantidad, i.unidad AS unidad, ci.costo_unitario_gs::float8 AS precio_unitario,
           round(ci.cantidad * ci.costo_unitario_gs)::float8 AS total_gs, NULL::uuid AS persona_id, NULL AS persona
    FROM consumo_insumo ci JOIN insumo i ON i.id = ci.insumo_id JOIN orden_trabajo o ON o.id = ci.orden_trabajo_id JOIN cliente c ON c.id = o.cliente_id
    WHERE true ${rango(sql`(ci.created_at AT TIME ZONE ${TZ})::date`)} ${deOT}`;

  const vehiculo = sql`
    SELECT (vi.hora_inicio AT TIME ZONE ${TZ})::date::text AS fecha, vi.hora_inicio AS ts, ${proyecto} AS proyecto, o.id AS ot_id, o.codigo_ot AS ot_codigo,
           c.nombre AS cliente, 'Vehículo' AS concepto,
           'Viaje ' || ve.chapa || ' · ' || trim_scale(vi.km_fin - vi.km_inicio)::text || ' km ÷ ' || n.n || ' OTs' AS descripcion,
           NULL AS hs_inicio, NULL AS hs_fin, round((vi.km_fin - vi.km_inicio) / n.n, 2)::float8 AS cantidad, 'km' AS unidad, ve.costo_km_gs::float8 AS precio_unitario,
           round((vi.km_fin - vi.km_inicio) / n.n * ve.costo_km_gs)::float8 AS total_gs, NULL::uuid AS persona_id, NULL AS persona
    FROM viaje vi JOIN vehiculo ve ON ve.id = vi.vehiculo_id
    JOIN LATERAL (SELECT count(DISTINCT pa.orden_trabajo_id) AS n FROM hoja_ruta_parada pa WHERE pa.hoja_ruta_id = vi.hoja_ruta_id AND pa.estado <> 'OMITIDA') n ON n.n > 0
    JOIN LATERAL (SELECT DISTINCT pa.orden_trabajo_id FROM hoja_ruta_parada pa WHERE pa.hoja_ruta_id = vi.hoja_ruta_id AND pa.estado <> 'OMITIDA') pa ON true
    JOIN orden_trabajo o ON o.id = pa.orden_trabajo_id JOIN cliente c ON c.id = o.cliente_id
    WHERE vi.km_fin IS NOT NULL ${rango(sql`(vi.hora_inicio AT TIME ZONE ${TZ})::date`)} ${deOT}`;

  // Con filtro de persona solo cuenta su mano de obra (es para pagar horas o ver lo que hizo).
  const partes = [quiere('MO') ? mo : null, quiere('INSUMO') && !f.personaId ? insumo : null, quiere('VEHICULO') && !f.personaId ? vehiculo : null]
    .filter((x): x is typeof mo => x !== null);
  if (!partes.length) return sql`SELECT NULL::text AS fecha, NULL::timestamptz AS ts WHERE false`;
  return partes.reduce((a, b) => sql`${a} UNION ALL ${b}`);
}

export async function listarRegistros(f: Filtro, pagina: number) {
  validarRango(f.desde, f.hasta);
  const base = baseRegistros(f);
  const items = await sql<FilaRegistro[]>`
    SELECT * FROM (${base}) r ORDER BY ts, concepto, ot_codigo LIMIT 25 OFFSET ${(pagina - 1) * 25}`;
  const [t] = await sql<{ total: number; mano_obra_gs: number; insumos_gs: number; vehiculos_gs: number; minutos: number }[]>`
    SELECT count(*)::int AS total,
           coalesce(sum(total_gs) FILTER (WHERE concepto = 'MO'), 0)::float8 AS mano_obra_gs,
           coalesce(sum(total_gs) FILTER (WHERE concepto = 'Insumo'), 0)::float8 AS insumos_gs,
           coalesce(sum(total_gs) FILTER (WHERE concepto = 'Vehículo'), 0)::float8 AS vehiculos_gs,
           coalesce(round(sum(cantidad) FILTER (WHERE concepto = 'MO')), 0)::int AS minutos
    FROM (${base}) r WHERE ${pagina} > 0`;
  const totales = { mano_obra_gs: t.mano_obra_gs, insumos_gs: t.insumos_gs, vehiculos_gs: t.vehiculos_gs, total_gs: t.mano_obra_gs + t.insumos_gs + t.vehiculos_gs, minutos: t.minutos };
  return { items: [...items], total: t.total, pagina, totales };
}

/** Todas las filas (para el Excel y la pre-factura), con tope. */
export async function todosLosRegistros(f: Filtro, tope = 50_000) {
  validarRango(f.desde, f.hasta);
  const filas = await sql<FilaRegistro[]>`SELECT * FROM (${baseRegistros(f)}) r ORDER BY ts, concepto, ot_codigo LIMIT ${tope + 1}`;
  if (filas.length > tope) throw new ErrorApp(400, `Son más de ${tope.toLocaleString('es-PY')} registros: achicá el período o filtrá por cliente`);
  return [...filas];
}
