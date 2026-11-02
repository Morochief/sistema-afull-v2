import { sql } from '../../db/client.js';
import { auditar } from '../auditoria/service.js';
import { publicarLive } from '../live/publicar.js';
import { puedeTransicionarTarea, esEstadoTareaFinal, type EstadoTarea, type TareaFila } from '@afull/shared';
import { ErrorApp, traducirErrorPg } from '../../lib/errores.js';
import { verificarUpdatedAt, esperarAvanceReloj } from '../clientes/service.js';
import type { Ctx } from '../clientes/service.js';

export type PatchTareaInput = {
  descripcion?: string;
  personaAsignadaId?: string | null;
  updatedAt: string;
};

export async function editarTarea(ctx: Ctx, tareaId: string, d: PatchTareaInput) {
  await esperarAvanceReloj(d.updatedAt);
  try {
    const editada = await sql.begin(async (tx) => {
      const [tarea] = await tx<{ estado: string; updated_at: Date; persona_asignada_id: string | null }[]>`
        SELECT estado, updated_at, persona_asignada_id FROM tarea WHERE id = ${tareaId} FOR UPDATE
      `;
      if (!tarea) throw new ErrorApp(404, 'Tarea no encontrada');
      if (esEstadoTareaFinal(tarea.estado as EstadoTarea)) {
        throw new ErrorApp(400, 'No se puede editar una tarea en estado final');
      }
      verificarUpdatedAt(tarea.updated_at, d.updatedAt);
      // Reasignar con el cronómetro corriendo dejaría un intervalo abierto de una persona sobre
      // una tarea que ya no es suya (no podría pausarla). Primero hay que pausarla.
      if (
        tarea.estado === 'EN_CURSO' &&
        d.personaAsignadaId !== undefined &&
        d.personaAsignadaId !== tarea.persona_asignada_id
      ) {
        throw new ErrorApp(409, 'La tarea está en curso: el operario debe pausarla antes de reasignarla');
      }

      if (d.personaAsignadaId) {
        const [p] = await tx<{ activo: boolean }[]>`SELECT activo FROM persona WHERE id = ${d.personaAsignadaId}`;
        if (!p?.activo) throw new ErrorApp(400, 'Persona asignada inexistente o inactiva');
      }

      const [res] = await tx<TareaFila[]>`
        UPDATE tarea
        SET
          descripcion = coalesce(${d.descripcion ?? null}, descripcion),
          persona_asignada_id = ${d.personaAsignadaId !== undefined ? d.personaAsignadaId : sql`persona_asignada_id`},
          updated_at = now()
        WHERE id = ${tareaId}
        RETURNING id, orden_trabajo_id, persona_asignada_id, NULL::varchar AS persona_asignada_nombre,
                  tipo, descripcion, orden_secuencia, estado, 0 AS minutos_trabajados, creado_por, created_at, updated_at
      `;

      await auditar(
        {
          usuarioId: ctx.usuarioId,
          accion: 'tarea.editar',
          recurso: 'tarea',
          recursoId: tareaId,
          ip: ctx.ip,
          metadata: { descripcion: d.descripcion, personaAsignadaId: d.personaAsignadaId },
        },
        tx
      );

      return res;
    });

    await publicarLive('tarea.editar', tareaId);
    return editada;
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}

export async function cancelarTarea(ctx: Ctx, tareaId: string, d: { desde: EstadoTarea; comentario: string }) {
  try {
    const cancelada = await sql.begin(async (tx) => {
      const [tarea] = await tx<{ estado: string }[]>`
        SELECT estado FROM tarea WHERE id = ${tareaId} FOR UPDATE
      `;
      if (!tarea) throw new ErrorApp(404, 'Tarea no encontrada');
      if (tarea.estado !== d.desde) {
        throw new ErrorApp(409, 'El estado de la tarea cambió concurrentemente');
      }
      if (!puedeTransicionarTarea(tarea.estado as EstadoTarea, 'CANCELADA')) {
        throw new ErrorApp(400, `No se puede cancelar una tarea en estado ${tarea.estado}`);
      }

      await tx`
        UPDATE tarea_intervalo
        SET hora_fin = greatest(clock_timestamp(), hora_inicio), motivo_cierre = 'OTRO'
        WHERE tarea_id = ${tareaId} AND hora_fin IS NULL
      `;

      const [res] = await tx<TareaFila[]>`
        UPDATE tarea
        SET estado = 'CANCELADA', updated_at = now()
        WHERE id = ${tareaId}
        RETURNING id, orden_trabajo_id, persona_asignada_id, NULL::varchar AS persona_asignada_nombre,
                  tipo, descripcion, orden_secuencia, estado, 0 AS minutos_trabajados, creado_por, created_at, updated_at
      `;

      await tx`
        INSERT INTO tarea_evento (tarea_id, estado_anterior, estado_nuevo, autor_id, comentario)
        VALUES (${tareaId}, ${tarea.estado}, 'CANCELADA', ${ctx.usuarioId}, ${d.comentario})
      `;

      await auditar(
        {
          usuarioId: ctx.usuarioId,
          accion: 'tarea.cancelar',
          recurso: 'tarea',
          recursoId: tareaId,
          ip: ctx.ip,
          metadata: { comentario: d.comentario },
        },
        tx
      );

      return res;
    });

    await publicarLive('tarea.cancelar', tareaId);
    return cancelada;
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}
