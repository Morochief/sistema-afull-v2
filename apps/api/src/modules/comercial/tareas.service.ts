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
import { COLUMNAS_PLAN_TAREA } from './tareas.mutaciones.service.js';

export type ItemTareaInput = {
  tipo: TipoTarea;
  descripcion: string;
  personaAsignadaId?: string;
  fechaTrabajo?: string;
  cantidad?: number;
  unidad?: string;
  minutosEstimados?: number;
};
const plan = (t: ItemTareaInput) => [t.fechaTrabajo ?? null, t.cantidad ?? null, t.unidad ?? null, t.minutosEstimados ?? null] as const;

/** El proceso tiene que existir en el catálogo y estar activo (el FK solo garantiza que exista). */
export async function exigirProcesoActivo(tx: TransactionSql | Sql, tipo: string) {
  const [t] = await tx<{ activo: boolean }[]>`SELECT activo FROM tipo_tarea WHERE codigo = ${tipo}`;
  if (!t?.activo) throw new ErrorApp(400, `Proceso inexistente o desactivado: ${tipo}`);
}

export async function insertarTareasIniciales(
  tx: TransactionSql | Sql,
  ctx: Ctx,
  otId: string,
  tareas: ItemTareaInput[]
) {
  for (let i = 0; i < tareas.length; i++) {
    const t = tareas[i];
    await exigirProcesoActivo(tx, t.tipo);
    if (t.personaAsignadaId) {
      const [p] = await tx<{ activo: boolean }[]>`SELECT activo FROM persona WHERE id = ${t.personaAsignadaId}`;
      if (!p?.activo) throw new ErrorApp(400, 'Persona asignada inexistente o inactiva');
    }

    const [tarea] = await tx<{ id: string }[]>`
      INSERT INTO tarea (orden_trabajo_id, persona_asignada_id, tipo, descripcion, orden_secuencia, estado, creado_por,
                         fecha_trabajo, cantidad, unidad, minutos_estimados)
      VALUES (${otId}, ${t.personaAsignadaId ?? null}, ${t.tipo}, ${t.descripcion}, ${i + 1}, 'PENDIENTE', ${ctx.usuarioId}, ${plan(t)[0]}, ${plan(t)[1]}, ${plan(t)[2]}, ${plan(t)[3]})
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
        t.fecha_trabajo::text AS fecha_trabajo, t.cantidad::float8 AS cantidad, t.unidad, t.minutos_estimados,
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
      const [ot] = await tx<{ estado: string; hoja_estado: string }[]>`SELECT estado, hoja_estado FROM orden_trabajo WHERE id = ${otId}`;
      if (!ot) throw new ErrorApp(404, 'OT no encontrada');
      if (esEstadoFinal(ot.estado as EstadoOT)) {
        throw new ErrorApp(400, 'No se pueden agregar tareas a una OT en estado final');
      }
      if (ot.hoja_estado === 'CERRADA') throw new ErrorApp(400, 'La hoja de ruta está cerrada: reabrila para agregar tareas');

      if (d.personaAsignadaId) {
        const [p] = await tx<{ activo: boolean }[]>`SELECT activo FROM persona WHERE id = ${d.personaAsignadaId}`;
        if (!p?.activo) throw new ErrorApp(400, 'Persona asignada inexistente o inactiva');
      }

      const [{ sig }] = await tx<{ sig: number }[]>`
        SELECT coalesce(max(orden_secuencia), 0) + 1 AS sig FROM tarea WHERE orden_trabajo_id = ${otId}
      `;

      await exigirProcesoActivo(tx, d.tipo);
      const [tarea] = await tx<TareaFila[]>`
        INSERT INTO tarea (orden_trabajo_id, persona_asignada_id, tipo, descripcion, orden_secuencia, estado, creado_por,
                           fecha_trabajo, cantidad, unidad, minutos_estimados)
        VALUES (${otId}, ${d.personaAsignadaId ?? null}, ${d.tipo}, ${d.descripcion}, ${sig}, 'PENDIENTE', ${ctx.usuarioId},
                ${plan(d)[0]}, ${plan(d)[1]}, ${plan(d)[2]}, ${plan(d)[3]})
        RETURNING id, orden_trabajo_id, persona_asignada_id, NULL::varchar AS persona_asignada_nombre,
                  tipo, descripcion, orden_secuencia, estado, 0 AS minutos_trabajados, ${COLUMNAS_PLAN_TAREA},
                  creado_por, created_at, updated_at
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
