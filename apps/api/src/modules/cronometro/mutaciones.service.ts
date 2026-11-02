import { sql } from '../../db/client.js';
import { auditar } from '../auditoria/service.js';
import { publicarLive } from '../live/publicar.js';
import { puedeTransicionarTarea, type MotivoCierreIntervalo, type EstadoTarea } from '@afull/shared';
import { ErrorApp, traducirErrorPg } from '../../lib/errores.js';
import type { Ctx } from '../clientes/service.js';

export async function pausarTarea(ctx: Ctx, tareaId: string, motivo: MotivoCierreIntervalo, claveIdempotencia: string) {
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

      const [tarea] = await tx<{ id: string; persona_asignada_id: string | null; estado: string }[]>`
        SELECT id, persona_asignada_id, estado FROM tarea WHERE id = ${tareaId} FOR UPDATE
      `;
      if (!tarea) throw new ErrorApp(404, 'Tarea no encontrada');
      if (tarea.persona_asignada_id !== persona.id) {
        throw new ErrorApp(403, 'Solo puedes operar tareas asignadas a tu persona');
      }
      if (!puedeTransicionarTarea(tarea.estado as EstadoTarea, 'PAUSADA')) {
        throw new ErrorApp(400, `No se puede pausar una tarea en estado ${tarea.estado}`);
      }

      await tx`
        UPDATE tarea_intervalo
        SET hora_fin = greatest(clock_timestamp(), hora_inicio), motivo_cierre = ${motivo}
        WHERE tarea_id = ${tareaId} AND persona_id = ${persona.id} AND hora_fin IS NULL
      `;

      await tx`
        UPDATE tarea SET estado = 'PAUSADA', updated_at = now() WHERE id = ${tareaId}
      `;

      await tx`
        INSERT INTO tarea_evento (tarea_id, estado_anterior, estado_nuevo, autor_id, comentario)
        VALUES (${tareaId}, ${tarea.estado}, 'PAUSADA', ${ctx.usuarioId}, ${motivo})
      `;

      await auditar(
        {
          usuarioId: ctx.usuarioId,
          accion: 'tarea.pausar',
          recurso: 'tarea',
          recursoId: tareaId,
          ip: ctx.ip,
          metadata: { motivo, claveIdempotencia },
        },
        tx
      );

      return { tareaId, estado: 'PAUSADA' };
    });
    await publicarLive('tarea.pausar', tareaId);
    return r;
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}

export async function finalizarTarea(ctx: Ctx, tareaId: string, comentario?: string, claveIdempotencia?: string) {
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

      const [tarea] = await tx<{ id: string; persona_asignada_id: string | null; estado: string }[]>`
        SELECT id, persona_asignada_id, estado FROM tarea WHERE id = ${tareaId} FOR UPDATE
      `;
      if (!tarea) throw new ErrorApp(404, 'Tarea no encontrada');
      if (tarea.persona_asignada_id !== persona.id) {
        throw new ErrorApp(403, 'Solo puedes operar tareas asignadas a tu persona');
      }
      if (!puedeTransicionarTarea(tarea.estado as EstadoTarea, 'LISTO')) {
        throw new ErrorApp(400, `No se puede finalizar una tarea en estado ${tarea.estado}`);
      }

      await tx`
        UPDATE tarea_intervalo
        SET hora_fin = greatest(clock_timestamp(), hora_inicio), motivo_cierre = 'FIN'
        WHERE tarea_id = ${tareaId} AND persona_id = ${persona.id} AND hora_fin IS NULL
      `;

      await tx`
        UPDATE tarea SET estado = 'LISTO', updated_at = now() WHERE id = ${tareaId}
      `;

      await tx`
        INSERT INTO tarea_evento (tarea_id, estado_anterior, estado_nuevo, autor_id, comentario)
        VALUES (${tareaId}, ${tarea.estado}, 'LISTO', ${ctx.usuarioId}, ${comentario ?? null})
      `;

      await auditar(
        {
          usuarioId: ctx.usuarioId,
          accion: 'tarea.finalizar',
          recurso: 'tarea',
          recursoId: tareaId,
          ip: ctx.ip,
          metadata: { comentario, claveIdempotencia },
        },
        tx
      );

      return { tareaId, estado: 'LISTO' };
    });
    await publicarLive('tarea.finalizar', tareaId);
    return r;
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}
