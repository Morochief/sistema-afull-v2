import { sql } from '../../db/client.js';
import { auditar } from '../auditoria/service.js';
import {
  esEstadoFinal,
  type EstadoOT,
  type TipoTarea,
  type TareaFila,
} from '@afull/shared';
import { ErrorApp, traducirErrorPg } from '../../lib/errores.js';
import type { Ctx } from '../clientes/service.js';
import type { Sql, TransactionSql } from 'postgres';

export type ItemTareaInput = {
  tipo: TipoTarea;
  descripcion: string;
  personaAsignadaId?: string;
};

export async function insertarTareasIniciales(
  tx: TransactionSql | Sql,
  ctx: Ctx,
  otId: string,
  tareas: ItemTareaInput[]
) {
  for (let i = 0; i < tareas.length; i++) {
    const t = tareas[i];
    if (t.personaAsignadaId) {
      const [p] = await tx<{ activo: boolean }[]>`SELECT activo FROM persona WHERE id = ${t.personaAsignadaId}`;
      if (!p?.activo) throw new ErrorApp(400, 'Persona asignada inexistente o inactiva');
    }

    const [tarea] = await tx<{ id: string }[]>`
      INSERT INTO tarea (orden_trabajo_id, persona_asignada_id, tipo, descripcion, orden_secuencia, estado, creado_por)
      VALUES (${otId}, ${t.personaAsignadaId ?? null}, ${t.tipo}, ${t.descripcion}, ${i + 1}, 'PENDIENTE', ${ctx.usuarioId})
      RETURNING id
    `;

    await tx`
      INSERT INTO tarea_evento (tarea_id, estado_anterior, estado_nuevo, autor_id, comentario)
      VALUES (${tarea.id}, NULL, 'PENDIENTE', ${ctx.usuarioId}, NULL)
    `;

    await auditar(
      {
        usuarioId: ctx.usuarioId,
        accion: 'tarea.crear',
        recurso: 'tarea',
        recursoId: tarea.id,
        ip: ctx.ip,
        metadata: { otId, tipo: t.tipo, descripcion: t.descripcion },
      },
      tx
    );
  }
}

export async function listarTareasOT(otId: string): Promise<TareaFila[]> {
  try {
    const items = await sql<TareaFila[]>`
      SELECT
        t.id,
        t.orden_trabajo_id,
        t.persona_asignada_id,
        p.nombre AS persona_asignada_nombre,
        t.tipo,
        t.descripcion,
        t.orden_secuencia,
        t.estado,
        coalesce(
          (
            SELECT round(sum(EXTRACT(EPOCH FROM (coalesce(i.hora_fin, now()) - i.hora_inicio)) / 60)::numeric, 0)::int
            FROM tarea_intervalo i
            WHERE i.tarea_id = t.id
          ),
          0
        ) AS minutos_trabajados,
        t.creado_por,
        t.created_at,
        t.updated_at
      FROM tarea t
      LEFT JOIN persona p ON p.id = t.persona_asignada_id
      WHERE t.orden_trabajo_id = ${otId}
      ORDER BY t.orden_secuencia ASC, t.created_at ASC
    `;
    return [...items];
  } catch (e) {
    traducirErrorPg(e);
  }
}

export async function agregarTareaOT(ctx: Ctx, otId: string, d: ItemTareaInput) {
  try {
    return await sql.begin(async (tx) => {
      const [ot] = await tx<{ estado: string }[]>`SELECT estado FROM orden_trabajo WHERE id = ${otId}`;
      if (!ot) throw new ErrorApp(404, 'OT no encontrada');
      if (esEstadoFinal(ot.estado as EstadoOT)) {
        throw new ErrorApp(400, 'No se pueden agregar tareas a una OT en estado final');
      }

      if (d.personaAsignadaId) {
        const [p] = await tx<{ activo: boolean }[]>`SELECT activo FROM persona WHERE id = ${d.personaAsignadaId}`;
        if (!p?.activo) throw new ErrorApp(400, 'Persona asignada inexistente o inactiva');
      }

      const [{ sig }] = await tx<{ sig: number }[]>`
        SELECT coalesce(max(orden_secuencia), 0) + 1 AS sig FROM tarea WHERE orden_trabajo_id = ${otId}
      `;

      const [tarea] = await tx<TareaFila[]>`
        INSERT INTO tarea (orden_trabajo_id, persona_asignada_id, tipo, descripcion, orden_secuencia, estado, creado_por)
        VALUES (${otId}, ${d.personaAsignadaId ?? null}, ${d.tipo}, ${d.descripcion}, ${sig}, 'PENDIENTE', ${ctx.usuarioId})
        RETURNING id, orden_trabajo_id, persona_asignada_id, NULL::varchar AS persona_asignada_nombre,
                  tipo, descripcion, orden_secuencia, estado, 0 AS minutos_trabajados, creado_por, created_at, updated_at
      `;

      await tx`
        INSERT INTO tarea_evento (tarea_id, estado_anterior, estado_nuevo, autor_id, comentario)
        VALUES (${tarea.id}, NULL, 'PENDIENTE', ${ctx.usuarioId}, NULL)
      `;

      await auditar(
        {
          usuarioId: ctx.usuarioId,
          accion: 'tarea.crear',
          recurso: 'tarea',
          recursoId: tarea.id,
          ip: ctx.ip,
          metadata: { otId, tipo: d.tipo },
        },
        tx
      );

      return tarea;
    });
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}

export { editarTarea, cancelarTarea, type PatchTareaInput } from './tareas.mutaciones.service.js';
