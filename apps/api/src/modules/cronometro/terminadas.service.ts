import { sql } from '../../db/client.js';
import { ErrorApp } from '../../lib/errores.js';
import { TAM_PAGINA, armarPagina, desplazamiento } from '../../lib/paginacion.js';
import type { MiTrabajoTerminadas, MiTrabajoTerminada } from '@afull/shared';
import { obtenerPersonaActiva } from './service.js';

const TZ = 'America/Asuncion';
const DIA = 86_400_000;

/**
 * Loop 15: lo que ya terminó el operario. Fecha de terminado = último evento LISTO (Asunción). El tiempo de cada tarea es
 * el suyo, con su fracción de tanda (Loop 12) y la hora efectiva (Loop 13), tomado de v_mano_obra. Sin montos.
 */
export async function misTerminadas(usuarioId: string, f: { desde: string; hasta: string; pagina: number }): Promise<MiTrabajoTerminadas> {
  const dias = (Date.parse(f.hasta) - Date.parse(f.desde)) / DIA;
  if (!(dias >= 0)) throw new ErrorApp(400, 'La fecha "desde" tiene que ser anterior o igual a "hasta"');
  if (dias > 92) throw new ErrorApp(400, 'El rango puede ser de hasta 92 días');
  const persona = await obtenerPersonaActiva(sql, usuarioId);
  const rango = sql`(${f.desde}::date)::timestamp AT TIME ZONE ${TZ}`;
  const fin = sql`((${f.hasta}::date) + 1)::timestamp AT TIME ZONE ${TZ}`;
  const base = sql`
    FROM tarea t
    JOIN LATERAL (SELECT max(e.created_at) AS at FROM tarea_evento e WHERE e.tarea_id = t.id AND e.estado_nuevo = 'LISTO') ev ON true
    JOIN orden_trabajo o ON o.id = t.orden_trabajo_id
    JOIN cliente c ON c.id = o.cliente_id
    LEFT JOIN LATERAL (
      SELECT round(sum(m.segundos * m.peso / m.peso_total)) AS seg FROM v_mano_obra m WHERE m.tarea_id = t.id AND m.persona_id = ${persona.id}
    ) mo ON true
    WHERE t.estado = 'LISTO' AND ev.at >= ${rango} AND ev.at < ${fin}
      AND (t.persona_asignada_id = ${persona.id}
           OR EXISTS (SELECT 1 FROM tarea_intervalo i WHERE i.tarea_id = t.id AND i.persona_id = ${persona.id}))`;
  const [{ total }] = await sql<{ total: number }[]>`SELECT count(*)::int AS total ${base}`;
  const items = await sql<MiTrabajoTerminada[]>`
    SELECT t.id AS tarea_id, o.id AS ot_id, o.codigo_ot AS ot_codigo, c.nombre AS cliente_nombre, t.descripcion, t.tipo,
           ev.at AS terminada_at, coalesce(mo.seg, 0)::int AS segundos, t.cantidad::float8 AS cantidad, t.unidad
    ${base}
    ORDER BY ev.at DESC, t.id LIMIT ${TAM_PAGINA} OFFSET ${desplazamiento(f.pagina)}`;
  const [{ seg }] = await sql<{ seg: number }[]>`
    SELECT coalesce(round(sum(m.segundos * m.peso / m.peso_total)), 0)::int AS seg
    FROM v_mano_obra m WHERE m.persona_id = ${persona.id} AND m.hora_inicio >= ${rango} AND m.hora_inicio < ${fin}`;
  return {
    ...armarPagina(items.map((i) => ({ ...i, terminada_at: new Date(i.terminada_at).toISOString() })), total, f.pagina),
    horas_periodo_segundos: seg,
  };
}
