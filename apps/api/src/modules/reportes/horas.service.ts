import { sql } from '../../db/client.js';
import { validarRango } from './registros.service.js';

const TZ = 'America/Asuncion';

/**
 * Loop 20: horas para pagar. Tiempo REAL del reloj de cada persona (hora efectiva del Loop 13; en una tanda cuenta
 * el tiempo entero, porque es lo que trabajó), × la tarifa vigente el día de cada tramo. Un reloj abierto se avisa
 * y no suma hasta cerrarlo (Personas → Horas).
 */
export async function horasParaPagar(desde: string, hasta: string) {
  validarRango(desde, hasta);
  const dia = sql`(vt.hora_inicio AT TIME ZONE ${TZ})::date`;
  return [...(await sql<{ persona_id: string; persona: string; segundos: number; tramos: number; total_gs: number; sin_tarifa: boolean; reloj_abierto: boolean }[]>`
    SELECT p.id AS persona_id, p.nombre AS persona,
           coalesce(floor(sum(extract(epoch FROM vt.hora_fin - vt.hora_inicio)) FILTER (WHERE vt.hora_fin IS NOT NULL)), 0)::int AS segundos,
           (count(*) FILTER (WHERE vt.hora_fin IS NOT NULL))::int AS tramos,
           round(coalesce(sum(extract(epoch FROM vt.hora_fin - vt.hora_inicio) / 3600 * tf.tarifa_hora_gs) FILTER (WHERE vt.hora_fin IS NOT NULL), 0))::float8 AS total_gs,
           coalesce(bool_or(tf.id IS NULL) FILTER (WHERE vt.hora_fin IS NOT NULL), false) AS sin_tarifa,
           bool_or(vt.hora_fin IS NULL) AS reloj_abierto
    FROM v_tramo vt JOIN persona p ON p.id = vt.persona_id
    LEFT JOIN tarifa_persona tf ON tf.persona_id = vt.persona_id AND ${dia} BETWEEN tf.fecha_inicio AND coalesce(tf.fecha_fin, 'infinity'::date)
    WHERE ${dia} BETWEEN ${desde}::date AND ${hasta}::date
    GROUP BY p.id, p.nombre ORDER BY p.nombre`)];
}

/** Detalle para la hoja "Detalle" del Excel: un tramo por fila. */
export async function detalleHoras(desde: string, hasta: string) {
  validarRango(desde, hasta);
  const dia = sql`(vt.hora_inicio AT TIME ZONE ${TZ})::date`;
  return [...(await sql<{ persona: string; fecha: string; inicio: string; fin: string | null; minutos: number | null; ot_codigo: string; cliente: string; tarea: string; nota: string; total_gs: number }[]>`
    SELECT p.nombre AS persona, ${dia}::text AS fecha, to_char(vt.hora_inicio AT TIME ZONE ${TZ}, 'HH24:MI') AS inicio,
           to_char(vt.hora_fin AT TIME ZONE ${TZ}, 'HH24:MI') AS fin,
           round(extract(epoch FROM vt.hora_fin - vt.hora_inicio) / 60)::int AS minutos,
           o.codigo_ot AS ot_codigo, c.nombre AS cliente, t.descripcion AS tarea,
           concat_ws(' · ', CASE WHEN vt.hora_fin IS NULL THEN 'reloj abierto (no suma)' END, CASE WHEN vt.origen = 'MANUAL' THEN 'a mano' END,
                     CASE WHEN vt.hora_fin <> vt.hora_fin_original OR vt.cerrado_por IS NOT NULL THEN 'corregido' END,
                     CASE WHEN vt.tanda_id IS NOT NULL THEN 'tanda' END, CASE WHEN tf.id IS NULL THEN 'sin tarifa' END) AS nota,
           round(coalesce(extract(epoch FROM vt.hora_fin - vt.hora_inicio) / 3600 * tf.tarifa_hora_gs, 0))::float8 AS total_gs
    FROM v_tramo vt JOIN persona p ON p.id = vt.persona_id JOIN tarea t ON t.id = vt.tarea_id
    JOIN orden_trabajo o ON o.id = t.orden_trabajo_id JOIN cliente c ON c.id = o.cliente_id
    LEFT JOIN tarifa_persona tf ON tf.persona_id = vt.persona_id AND ${dia} BETWEEN tf.fecha_inicio AND coalesce(tf.fecha_fin, 'infinity'::date)
    WHERE ${dia} BETWEEN ${desde}::date AND ${hasta}::date
    ORDER BY p.nombre, vt.hora_inicio LIMIT 50000`)];
}
