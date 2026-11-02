import { sql } from '../../db/client.js';
import { auditar } from '../auditoria/service.js';
import { publicarLive } from '../live/publicar.js';
import { puedeTransicionarTarea, type MiTrabajoRespuesta, type MiTrabajoTarea, type EstadoTarea } from '@afull/shared';
import { ErrorApp, traducirErrorPg } from '../../lib/errores.js';
import type { Ctx } from '../clientes/service.js';

export async function obtenerPersonaActiva(txOrSql: typeof sql, usuarioId: string) {
  const [u] = await txOrSql<{ persona_id: string | null }[]>`
    SELECT persona_id FROM usuario WHERE id = ${usuarioId}
  `;
  if (!u?.persona_id) {
    throw new ErrorApp(403, 'Tu usuario no está vinculado a una persona');
  }
  const [p] = await txOrSql<{ id: string; nombre: string; activo: boolean }[]>`
    SELECT id, nombre, activo FROM persona WHERE id = ${u.persona_id}
  `;
  if (!p || !p.activo) {
    throw new ErrorApp(403, 'Persona vinculada inexistente o inactiva');
  }
  return p;
}

export async function obtenerMiTrabajo(ctx: Ctx): Promise<MiTrabajoRespuesta> {
  try {
    const persona = await obtenerPersonaActiva(sql, ctx.usuarioId);

    const [intervaloAbierto] = await sql<{ id: string; tarea_id: string; hora_inicio: Date }[]>`
      SELECT id, tarea_id, hora_inicio
      FROM tarea_intervalo
      WHERE persona_id = ${persona.id} AND hora_fin IS NULL
    `;

    const [{ minutos_hoy }] = await sql<{ minutos_hoy: number }[]>`
      SELECT coalesce(
        round(sum(EXTRACT(EPOCH FROM (coalesce(hora_fin, now()) - hora_inicio)) / 60)::numeric, 0)::int,
        0
      ) AS minutos_hoy
      FROM tarea_intervalo
      WHERE persona_id = ${persona.id}
        AND hora_inicio >= (date_trunc('day', now() AT TIME ZONE 'America/Asuncion') AT TIME ZONE 'America/Asuncion')
    `;

    const tareas = await sql<MiTrabajoTarea[]>`
      SELECT
        t.id,
        t.orden_trabajo_id,
        ot.codigo_ot,
        ot.titulo AS ot_titulo,
        c.nombre AS cliente_nombre,
        t.tipo,
        t.descripcion,
        t.estado,
        coalesce(
          (
            SELECT round(sum(EXTRACT(EPOCH FROM (coalesce(i.hora_fin, now()) - i.hora_inicio)) / 60)::numeric, 0)::int
            FROM tarea_intervalo i
            WHERE i.tarea_id = t.id AND i.persona_id = ${persona.id}
              AND i.hora_inicio >= (date_trunc('day', now() AT TIME ZONE 'America/Asuncion') AT TIME ZONE 'America/Asuncion')
          ),
          0
        ) AS minutos_trabajados_hoy,
        (
          SELECT json_build_object('id', i.id, 'hora_inicio', i.hora_inicio)
          FROM tarea_intervalo i
          WHERE i.tarea_id = t.id AND i.persona_id = ${persona.id} AND i.hora_fin IS NULL
        ) AS intervalo_abierto,
        t.updated_at
      FROM tarea t
      JOIN orden_trabajo ot ON ot.id = t.orden_trabajo_id
      JOIN cliente c ON c.id = ot.cliente_id
      WHERE t.persona_asignada_id = ${persona.id}
        AND t.estado NOT IN ('LISTO', 'CANCELADA')
      ORDER BY
        CASE WHEN t.estado = 'EN_CURSO' THEN 0 ELSE 1 END,
        t.updated_at DESC
    `;

    return {
      servidor_ahora: new Date().toISOString(),
      persona: { id: persona.id, nombre: persona.nombre },
      intervalo_abierto_actual: intervaloAbierto
        ? {
            tarea_id: intervaloAbierto.tarea_id,
            intervalo_id: intervaloAbierto.id,
            hora_inicio: intervaloAbierto.hora_inicio.toISOString(),
          }
        : null,
      minutos_hoy_total: minutos_hoy,
      tareas: [...tareas],
    };
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}

export async function iniciarTarea(ctx: Ctx, tareaId: string, claveIdempotencia: string) {
  try {
    const r = await sql.begin(async (tx) => {
      const [u] = await tx<{ persona_id: string | null }[]>`
        SELECT persona_id FROM usuario WHERE id = ${ctx.usuarioId}
      `;
      if (!u?.persona_id) throw new ErrorApp(403, 'Tu usuario no está vinculado a una persona');

      const [persona] = await tx<{ id: string; activo: boolean }[]>`
        SELECT id, activo FROM persona WHERE id = ${u.persona_id} FOR UPDATE
      `;
      if (!persona || !persona.activo) throw new ErrorApp(403, 'Persona vinculada inexistente o inactiva');

      const [existente] = await tx<{ id: string; tarea_id: string; hora_inicio: Date }[]>`
        SELECT id, tarea_id, hora_inicio FROM tarea_intervalo WHERE clave_idempotencia = ${claveIdempotencia}
      `;
      if (existente) {
        return { esIdempotente: true, intervaloId: existente.id, tareaId: existente.tarea_id, horaInicio: existente.hora_inicio };
      }

      const [tarea] = await tx<{ id: string; persona_asignada_id: string | null; estado: string }[]>`
        SELECT id, persona_asignada_id, estado FROM tarea WHERE id = ${tareaId} FOR UPDATE
      `;
      if (!tarea) throw new ErrorApp(404, 'Tarea no encontrada');
      if (tarea.persona_asignada_id !== persona.id) {
        throw new ErrorApp(403, 'Solo puedes operar tareas asignadas a tu persona');
      }
      if (!puedeTransicionarTarea(tarea.estado as EstadoTarea, 'EN_CURSO')) {
        throw new ErrorApp(400, `No se puede iniciar una tarea en estado ${tarea.estado}`);
      }

      const [intervaloAbierto] = await tx<{ id: string; tarea_id: string }[]>`
        SELECT id, tarea_id FROM tarea_intervalo WHERE persona_id = ${persona.id} AND hora_fin IS NULL FOR UPDATE
      `;
      let autoPausadaTareaId: string | null = null;
      if (intervaloAbierto) {
        if (intervaloAbierto.tarea_id === tareaId) {
          throw new ErrorApp(409, 'La tarea ya tiene un cronómetro en curso');
        }
        await tx`
          UPDATE tarea_intervalo
          SET hora_fin = greatest(clock_timestamp(), hora_inicio), motivo_cierre = 'CAMBIO_TAREA'
          WHERE id = ${intervaloAbierto.id}
        `;
        await tx`
          UPDATE tarea SET estado = 'PAUSADA', updated_at = now() WHERE id = ${intervaloAbierto.tarea_id}
        `;
        await tx`
          INSERT INTO tarea_evento (tarea_id, estado_anterior, estado_nuevo, autor_id, comentario)
          VALUES (${intervaloAbierto.tarea_id}, 'EN_CURSO', 'PAUSADA', ${ctx.usuarioId}, 'Auto-pausa por cambio de tarea')
        `;
        autoPausadaTareaId = intervaloAbierto.tarea_id;
      }

      const [nuevoIntervalo] = await tx<{ id: string; hora_inicio: Date }[]>`
        INSERT INTO tarea_intervalo (tarea_id, persona_id, hora_inicio, clave_idempotencia)
        VALUES (${tareaId}, ${persona.id}, clock_timestamp(), ${claveIdempotencia})
        RETURNING id, hora_inicio
      `;

      await tx`
        UPDATE tarea SET estado = 'EN_CURSO', updated_at = now() WHERE id = ${tareaId}
      `;

      await tx`
        INSERT INTO tarea_evento (tarea_id, estado_anterior, estado_nuevo, autor_id, comentario)
        VALUES (${tareaId}, ${tarea.estado}, 'EN_CURSO', ${ctx.usuarioId}, NULL)
      `;

      await auditar(
        {
          usuarioId: ctx.usuarioId,
          accion: 'tarea.iniciar',
          recurso: 'tarea',
          recursoId: tareaId,
          ip: ctx.ip,
          metadata: { intervaloId: nuevoIntervalo.id, claveIdempotencia, autoPausadaTareaId },
        },
        tx
      );

      return {
        esIdempotente: false,
        intervaloId: nuevoIntervalo.id,
        tareaId,
        horaInicio: nuevoIntervalo.hora_inicio,
        autoPausadaTareaId,
      };
    });

    if (!r?.esIdempotente) {
      await publicarLive('tarea.iniciar', tareaId);
    }
    return r;
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}
