import { sql } from '../../db/client.js';
import type { LiveEstadoRespuesta, LivePersonaItem } from '@afull/shared';

export async function obtenerEstadoLive(): Promise<LiveEstadoRespuesta> {
  const ahora = new Date();
  const servidorAhora = ahora.toISOString();

  const filas = await sql<{
    persona_id: string;
    persona_nombre: string;
    intervalo_id: string | null;
    intervalo_hora_inicio: Date | null;
    tarea_id: string | null;
    tarea_tipo: string | null;
    tarea_descripcion: string | null;
    ot_id: string | null;
    ot_codigo: string | null;
    ot_titulo: string | null;
    cliente_nombre: string | null;
    minutos_hoy: number;
  }[]>`
    SELECT 
      p.id AS persona_id,
      p.nombre AS persona_nombre,
      i.id AS intervalo_id,
      i.hora_inicio AS intervalo_hora_inicio,
      t.id AS tarea_id,
      t.tipo AS tarea_tipo,
      t.descripcion AS tarea_descripcion,
      o.id AS ot_id,
      o.codigo_ot AS ot_codigo,
      o.titulo AS ot_titulo,
      c.nombre AS cliente_nombre,
      COALESCE(
        (SELECT ROUND(SUM(EXTRACT(EPOCH FROM (COALESCE(ic.hora_fin, clock_timestamp()) - ic.hora_inicio)) / 60))
         FROM tarea_intervalo ic
         WHERE ic.persona_id = p.id
           AND ic.hora_inicio >= (date_trunc('day', now() AT TIME ZONE 'America/Asuncion') AT TIME ZONE 'America/Asuncion')
        ), 0
      )::int AS minutos_hoy
    FROM persona p
    LEFT JOIN tarea_intervalo i ON i.persona_id = p.id AND i.hora_fin IS NULL
    LEFT JOIN tarea t ON t.id = i.tarea_id
    LEFT JOIN orden_trabajo o ON o.id = t.orden_trabajo_id
    LEFT JOIN cliente c ON c.id = o.cliente_id
    WHERE p.activo = true
      AND (
        i.id IS NOT NULL
        OR EXISTS (
          SELECT 1 FROM usuario u
          JOIN permiso_capacidad pc ON pc.usuario_id = u.id AND pc.capacidad IN ('taller', 'montaje', 'diseno')
          WHERE u.persona_id = p.id AND u.activo = true
        )
      )
    ORDER BY p.nombre ASC
  `;

  const personas: LivePersonaItem[] = filas.map((f) => {
    const enCurso = Boolean(f.intervalo_id && f.intervalo_hora_inicio && f.tarea_id);
    let intervaloAbierto: LivePersonaItem['intervalo_abierto'] = null;

    if (enCurso && f.intervalo_id && f.intervalo_hora_inicio && f.tarea_id && f.ot_id) {
      const minutosTranscurridos = Math.max(
        0,
        Math.floor((ahora.getTime() - new Date(f.intervalo_hora_inicio).getTime()) / 60000)
      );
      intervaloAbierto = {
        id: f.intervalo_id,
        hora_inicio: f.intervalo_hora_inicio.toISOString(),
        minutos_transcurridos: minutosTranscurridos,
        tarea: {
          id: f.tarea_id,
          tipo: f.tarea_tipo ?? '',
          descripcion: f.tarea_descripcion ?? '',
          orden_trabajo: {
            id: f.ot_id,
            codigo_ot: f.ot_codigo ?? '',
            titulo: f.ot_titulo ?? '',
            cliente_nombre: f.cliente_nombre ?? '',
          },
        },
      };
    }

    return {
      persona_id: f.persona_id,
      nombre: f.persona_nombre,
      en_curso: enCurso,
      minutos_hoy: Number(f.minutos_hoy ?? 0),
      intervalo_abierto: intervaloAbierto,
    };
  });

  return {
    servidor_ahora: servidorAhora,
    personas,
  };
}
