import type postgres from 'postgres';
import { sql } from '../../db/client.js';

type Q = postgres.Sql | postgres.TransactionSql;

export type LineaManoObra = { persona: string; proceso: string; horas: number; tarifa_hora_gs: number | null; costo_gs: number; sin_tarifa: boolean };
export type LineaViaje = { viaje_id: string; fecha: string; chapa: string; km_viaje: number; ots_en_hoja: number; km_ot: number; costo_km_gs: number; costo_gs: number };
export type Costeo = {
  horas: number; mano_obra_gs: number; material_gs: number; desperdicio_gs: number; km: number; km_gs: number; total_gs: number;
  monto_presupuestado_gs: number | null; margen_pct: number | null;
  mano_obra: LineaManoObra[]; viajes: LineaViaje[]; alertas: string[];
};

/** Margen sobre la venta (como el presupuesto): (venta − costo) ÷ venta, con 2 decimales. Sin venta → null. */
export function margenSobreVenta(ventaGs: number | null, costoGs: number): number | null {
  if (!ventaGs) return null;
  return Math.round(((ventaGs - costoGs) * 10_000) / ventaGs) / 100;
}

/**
 * Costo real de una OT a la fecha, calculado en Postgres con NUMERIC exacto:
 * - Mano de obra: cada intervalo cerrado × la tarifa de la persona vigente el día (Asunción) en que empezó;
 *   los de una tanda compartida, por la fracción de m² de cada OT (v_mano_obra, Loop 12).
 * - Material: consumos con su costo congelado (las correcciones restan).
 * - Km: cada viaje cerrado de una hoja de ruta se reparte en partes iguales entre las OTs con parada no omitida.
 * Cada componente se redondea UNA vez a guaraníes; el total es la suma de los componentes redondeados.
 */
export async function calcularCosteo(q: Q, otId: string): Promise<Costeo> {
  const mano = await q`
    SELECT p.nombre AS persona, coalesce(tt.nombre, t.tipo) AS proceso,
           sum(v.segundos * v.peso / v.peso_total / 3600)::text AS horas,
           -- Si la tarifa cambió en el medio de la OT no hay una sola: se muestra vacía (el costo igual es exacto).
           CASE WHEN count(DISTINCT tf.tarifa_hora_gs) = 1 THEN max(tf.tarifa_hora_gs)::text END AS tarifa,
           coalesce(sum(v.segundos * v.peso / v.peso_total / 3600 * tf.tarifa_hora_gs), 0)::text AS costo,
           bool_or(tf.id IS NULL) AS sin_tarifa
    -- v_mano_obra: tramos cerrados; los de una tanda compartida se reparten por m² entre sus OTs (Loop 12).
    FROM v_mano_obra v
    JOIN tarea t ON t.id = v.tarea_id
    JOIN persona p ON p.id = v.persona_id
    LEFT JOIN tipo_tarea tt ON tt.codigo = t.tipo
    LEFT JOIN tarifa_persona tf ON tf.persona_id = v.persona_id
      AND (v.hora_inicio AT TIME ZONE 'America/Asuncion')::date BETWEEN tf.fecha_inicio AND coalesce(tf.fecha_fin, 'infinity'::date)
    WHERE v.orden_trabajo_id = ${otId}
    GROUP BY p.nombre, coalesce(tt.nombre, t.tipo)
    ORDER BY p.nombre, 2
  `;
  const [[mat], [{ abiertos }], viajes, [ot]] = await Promise.all([
    q`SELECT coalesce(sum(cantidad * costo_unitario_gs), 0)::text AS total,
             coalesce(sum(cantidad * costo_unitario_gs) FILTER (WHERE es_desperdicio), 0)::text AS desperdicio
      FROM consumo_insumo WHERE orden_trabajo_id = ${otId}`,
    q`SELECT count(*)::int AS abiertos FROM tarea_intervalo i
      WHERE i.hora_fin IS NULL AND EXISTS (
        SELECT 1 FROM tarea t LEFT JOIN tanda_tarea tt ON tt.tanda_id = i.tanda_id
        WHERE t.id = coalesce(tt.tarea_id, i.tarea_id) AND t.orden_trabajo_id = ${otId})`,
    q`
      WITH v AS (
        SELECT vi.id, (vi.hora_inicio AT TIME ZONE 'America/Asuncion')::date::text AS fecha, ve.chapa,
               vi.km_fin - vi.km_inicio AS km, ve.costo_km_gs,
               (SELECT count(DISTINCT pa.orden_trabajo_id) FROM hoja_ruta_parada pa
                 WHERE pa.hoja_ruta_id = vi.hoja_ruta_id AND pa.estado <> 'OMITIDA') AS n
        FROM viaje vi JOIN vehiculo ve ON ve.id = vi.vehiculo_id
        WHERE vi.km_fin IS NOT NULL AND EXISTS (
          SELECT 1 FROM hoja_ruta_parada pa WHERE pa.hoja_ruta_id = vi.hoja_ruta_id AND pa.orden_trabajo_id = ${otId} AND pa.estado <> 'OMITIDA'
        )
      )
      SELECT id AS viaje_id, fecha, chapa, km::text AS km_viaje, n::int AS ots_en_hoja, (km / n)::text AS km_ot,
             costo_km_gs::text AS costo_km_gs, (km / n * costo_km_gs)::text AS costo
      FROM v ORDER BY fecha, chapa
    `,
    q`SELECT monto_presupuestado_gs::text AS monto FROM orden_trabajo WHERE id = ${otId}`,
  ]);

  const suma = (xs: readonly { [k: string]: unknown }[], k: string) => xs.reduce((a, x) => a + Number(x[k]), 0);
  const manoObra: LineaManoObra[] = mano.map((m) => ({
    persona: m.persona, proceso: m.proceso, horas: Math.round(Number(m.horas) * 100) / 100,
    tarifa_hora_gs: m.tarifa === null ? null : Number(m.tarifa), costo_gs: Math.round(Number(m.costo)), sin_tarifa: m.sin_tarifa,
  }));
  const lineasViaje: LineaViaje[] = viajes.map((v) => ({
    viaje_id: v.viaje_id, fecha: v.fecha, chapa: v.chapa, km_viaje: Number(v.km_viaje), ots_en_hoja: v.ots_en_hoja,
    km_ot: Math.round(Number(v.km_ot) * 10) / 10, costo_km_gs: Number(v.costo_km_gs), costo_gs: Math.round(Number(v.costo)),
  }));
  // Redondeo único por componente, sobre la suma exacta (no sobre las líneas ya redondeadas).
  const manoObraGs = Math.round(suma(mano, 'costo'));
  const materialGs = Math.round(Number(mat.total));
  const kmGs = Math.round(suma(viajes, 'costo'));
  const total = manoObraGs + materialGs + kmGs;
  const monto = ot?.monto === null || ot?.monto === undefined ? null : Number(ot.monto);

  const alertas: string[] = [];
  const sinTarifa = [...new Set(manoObra.filter((m) => m.sin_tarifa).map((m) => m.persona))];
  if (sinTarifa.length) alertas.push(`Horas sin tarifa vigente (cuentan 0): ${sinTarifa.join(', ')}`);
  if (abiertos > 0) alertas.push(`${abiertos} cronómetro(s) todavía corriendo: no se cuentan hasta que se paren`);
  if (lineasViaje.some((v) => v.costo_km_gs === 0)) alertas.push('Hay vehículos sin costo por km cargado');
  if (monto === null) alertas.push('La OT no tiene monto presupuestado: no se puede calcular el margen');

  return {
    horas: Math.round(suma(mano, 'horas') * 100) / 100, mano_obra_gs: manoObraGs,
    material_gs: materialGs, desperdicio_gs: Math.round(Number(mat.desperdicio)),
    km: Math.round(suma(viajes, 'km_ot') * 10) / 10, km_gs: kmGs, total_gs: total,
    monto_presupuestado_gs: monto, margen_pct: margenSobreVenta(monto, total),
    mano_obra: manoObra, viajes: lineasViaje, alertas,
  };
}

/** Guarda el snapshot de cierre (inmutable). Se llama dentro de la transacción que pasa la OT a estado final. */
export async function guardarSnapshot(tx: postgres.TransactionSql, otId: string, estadoFinal: 'TERMINADO' | 'CANCELADO', usuarioId: string) {
  const c = await calcularCosteo(tx, otId);
  await tx`
    INSERT INTO ot_costeo (orden_trabajo_id, estado_final, horas, mano_obra_gs, material_gs, desperdicio_gs, km, km_gs, total_gs,
                           monto_presupuestado_gs, margen_pct, detalle, generado_por)
    VALUES (${otId}, ${estadoFinal}, ${c.horas}, ${c.mano_obra_gs}, ${c.material_gs}, ${c.desperdicio_gs}, ${c.km}, ${c.km_gs}, ${c.total_gs},
            ${c.monto_presupuestado_gs}, ${c.margen_pct}, ${tx.json({ mano_obra: c.mano_obra, viajes: c.viajes, alertas: c.alertas })}, ${usuarioId})
  `;
  return c;
}

export const leerSnapshot = (otId: string) => sql`SELECT * FROM ot_costeo WHERE orden_trabajo_id = ${otId}`;
