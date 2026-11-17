import { sql } from '../../db/client.js';
import type { PanelRespuesta } from '@afull/shared';

const TZ = 'America/Asuncion';

type Fila = {
  persona_id: string; nombre: string; operativo: boolean; marca: 'ENTRADA' | 'SALIDA' | null; marcada_at: Date | null;
  ab_tarea: string | null; ab_desc: string | null; ab_ot: string | null; ab_codigo: string | null; ab_cliente: string | null; ab_desde: Date | null;
  ul_tarea: string | null; ul_desc: string | null; ul_estado: string | null; ul_motivo: string | null; ul_fin: Date | null;
  ul_codigo: string | null; ul_cliente: string | null; pendientes: number;
};

/**
 * Loop 14: quién está y en qué. Una consulta: por persona activa, su última marcación de hoy, el tramo abierto,
 * el último tramo cerrado hoy y las tareas pendientes para hoy (las mismas que ve en Mi trabajo). Sin montos.
 */
export async function obtenerPanel(): Promise<PanelRespuesta> {
  const filas = await sql<Fila[]>`
    WITH hoy AS (SELECT (date_trunc('day', now() AT TIME ZONE ${TZ}) AT TIME ZONE ${TZ}) AS ini, (now() AT TIME ZONE ${TZ})::date AS dia)
    SELECT p.id AS persona_id, p.nombre,
      EXISTS (SELECT 1 FROM usuario u JOIN permiso_capacidad pc ON pc.usuario_id = u.id
              WHERE u.persona_id = p.id AND u.activo AND pc.capacidad IN ('taller', 'montaje', 'diseno')) AS operativo,
      m.tipo AS marca, m.marcada_at,
      ab.tarea_id AS ab_tarea, ab.descripcion AS ab_desc, ab.ot_id AS ab_ot, ab.codigo_ot AS ab_codigo, ab.cliente AS ab_cliente, ab.hora_inicio AS ab_desde,
      ul.tarea_id AS ul_tarea, ul.descripcion AS ul_desc, ul.estado AS ul_estado, ul.motivo_cierre AS ul_motivo, ul.hora_fin AS ul_fin,
      ul.codigo_ot AS ul_codigo, ul.cliente AS ul_cliente,
      pend.n AS pendientes
    FROM persona p
    CROSS JOIN hoy
    LEFT JOIN LATERAL (
      SELECT x.tipo, x.marcada_at FROM marcacion_asistencia x WHERE x.persona_id = p.id AND x.marcada_at >= hoy.ini
      ORDER BY x.marcada_at DESC LIMIT 1) m ON true
    LEFT JOIN LATERAL (
      SELECT i.tarea_id, i.hora_inicio, t.descripcion, o.id AS ot_id, o.codigo_ot, c.nombre AS cliente
      FROM tarea_intervalo i JOIN tarea t ON t.id = i.tarea_id JOIN orden_trabajo o ON o.id = t.orden_trabajo_id JOIN cliente c ON c.id = o.cliente_id
      WHERE i.persona_id = p.id AND i.hora_fin IS NULL LIMIT 1) ab ON true
    LEFT JOIN LATERAL (
      SELECT v.tarea_id, v.hora_fin, v.motivo_cierre, t.descripcion, t.estado, o.codigo_ot, c.nombre AS cliente
      FROM v_tramo v JOIN tarea t ON t.id = v.tarea_id JOIN orden_trabajo o ON o.id = t.orden_trabajo_id JOIN cliente c ON c.id = o.cliente_id
      WHERE v.persona_id = p.id AND v.hora_fin >= hoy.ini ORDER BY v.hora_fin DESC LIMIT 1) ul ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS n FROM tarea t JOIN orden_trabajo o ON o.id = t.orden_trabajo_id
      WHERE t.persona_asignada_id = p.id AND t.estado IN ('PENDIENTE', 'PAUSADA') AND o.hoja_estado = 'ACTIVA'
        AND o.estado NOT IN ('TERMINADO', 'CANCELADO') AND (t.fecha_trabajo IS NULL OR t.fecha_trabajo <= hoy.dia)) pend ON true
    WHERE p.activo
    ORDER BY p.nombre`;

  const r: PanelRespuesta = { servidor_ahora: new Date().toISOString(), trabajando: [], en_pausa: [], sin_tarea: [], sin_marcar: [] };
  for (const f of filas) {
    const base = { persona_id: f.persona_id, nombre: f.nombre, marcada_at: f.marcada_at?.toISOString() ?? null };
    if (f.ab_tarea && f.ab_desde) {
      r.trabajando.push({
        ...base, tarea_id: f.ab_tarea, tarea_descripcion: f.ab_desc ?? '', ot_id: f.ab_ot ?? '', ot_codigo: f.ab_codigo ?? '',
        cliente_nombre: f.ab_cliente ?? '', desde: f.ab_desde.toISOString(), salio: f.marca === 'SALIDA',
      });
    } else if (f.marca === 'SALIDA') {
      continue;
    } else if (f.ul_tarea && f.ul_fin && f.ul_estado === 'PAUSADA') {
      r.en_pausa.push({
        ...base, tarea_id: f.ul_tarea, tarea_descripcion: f.ul_desc ?? '', ot_codigo: f.ul_codigo ?? '', cliente_nombre: f.ul_cliente ?? '',
        motivo: f.ul_motivo ?? 'PAUSA', desde: f.ul_fin.toISOString(),
      });
    } else if (f.marca === 'ENTRADA') {
      r.sin_tarea.push({ ...base, pendientes_hoy: f.pendientes });
    } else if (f.operativo) {
      r.sin_marcar.push(base);
    }
  }
  return r;
}
