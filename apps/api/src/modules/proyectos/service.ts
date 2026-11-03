import { sql } from '../../db/client.js';
import { esEstadoFinal, type EstadoOT, type EstadoProyecto, type Pagina, type ProyectoDetalle, type ProyectoFila } from '@afull/shared';
import { auditar } from '../auditoria/service.js';
import { ErrorApp, traducirErrorPg } from '../../lib/errores.js';
import { TAM_PAGINA, desplazamiento, escaparLike, armarPagina } from '../../lib/paginacion.js';
import { type Ctx, esperarAvanceReloj, verificarUpdatedAt } from '../clientes/service.js';

export type FiltroProyectos = { pagina: number; q?: string; estado?: EstadoProyecto; clienteId?: string; desde?: string; hasta?: string };

function donde(f: FiltroProyectos) {
  const patron = f.q?.trim() ? `%${escaparLike(f.q.trim())}%` : null;
  return sql`WHERE ${true}
    ${f.estado ? sql`AND py.estado = ${f.estado}` : sql``}
    ${f.clienteId ? sql`AND py.cliente_id = ${f.clienteId}` : sql``}
    ${patron ? sql`AND (py.codigo ILIKE ${patron} OR py.nombre ILIKE ${patron} OR c.nombre ILIKE ${patron})` : sql``}
    ${f.desde ? sql`AND py.created_at >= (${f.desde}::date)::timestamp AT TIME ZONE 'America/Asuncion'` : sql``}
    ${f.hasta ? sql`AND py.created_at < ((${f.hasta}::date + 1)::timestamp AT TIME ZONE 'America/Asuncion')` : sql``}`;
}

const COLUMNAS = sql`py.id, py.codigo, py.cliente_id, c.nombre AS cliente_nombre, py.nombre, py.descripcion,
  py.estado, py.creado_por, py.created_at, py.updated_at`;

export async function listarProyectos(f: FiltroProyectos): Promise<Pagina<ProyectoFila>> {
  try {
    const [{ total }] = await sql`SELECT count(*)::int AS total FROM proyecto py JOIN cliente c ON c.id = py.cliente_id ${donde(f)}`;
    const items = await sql`
      SELECT ${COLUMNAS} FROM proyecto py JOIN cliente c ON c.id = py.cliente_id ${donde(f)}
      ORDER BY py.created_at DESC, py.id LIMIT ${TAM_PAGINA} OFFSET ${desplazamiento(f.pagina)}
    `;
    return armarPagina([...items], total, f.pagina) as Pagina<ProyectoFila>;
  } catch (e) {
    traducirErrorPg(e);
  }
}

export async function obtenerProyecto(id: string): Promise<ProyectoDetalle> {
  try {
    const [py] = await sql`SELECT ${COLUMNAS} FROM proyecto py JOIN cliente c ON c.id = py.cliente_id WHERE py.id = ${id}`;
    if (!py) throw new ErrorApp(404, 'Proyecto no encontrado');
    const ots = await sql`
      SELECT o.id, o.codigo_ot, o.titulo, o.estado, o.monto_presupuestado_gs::float8 AS monto_presupuestado_gs,
             o.sucursal_id, s.nombre AS sucursal_nombre
      FROM orden_trabajo o LEFT JOIN sucursal s ON s.id = o.sucursal_id
      WHERE o.proyecto_id = ${id} ORDER BY o.codigo_ot
    `;
    const total = ots.reduce((acc, o) => acc + Number(o.monto_presupuestado_gs ?? 0), 0);
    return { ...py, ordenes_trabajo: [...ots], total_presupuestado_gs: total } as unknown as ProyectoDetalle;
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}

/** Cerrar o cancelar exige que TODAS sus OTs estén en estado final (CA-3.7). Cancelar exige motivo. */
export async function finalizarProyecto(ctx: Ctx, id: string, a: 'CERRADO' | 'CANCELADO', comentario?: string) {
  const motivo = comentario?.trim();
  if (a === 'CANCELADO' && !motivo) throw new ErrorApp(400, 'Cancelar el proyecto requiere un motivo');
  try {
    return await sql.begin(async (tx) => {
      const [py] = await tx`SELECT estado FROM proyecto WHERE id = ${id} FOR UPDATE`;
      if (!py) throw new ErrorApp(404, 'Proyecto no encontrado');
      if (py.estado !== 'ABIERTO') throw new ErrorApp(409, `El proyecto ya está ${py.estado}`);
      const abiertas = (await tx<{ codigo_ot: string; estado: string }[]>`
        SELECT codigo_ot, estado FROM orden_trabajo WHERE proyecto_id = ${id} FOR SHARE
      `).filter((o) => !esEstadoFinal(o.estado as EstadoOT));
      if (abiertas.length > 0) {
        throw new ErrorApp(409, `Hay OTs sin terminar: ${abiertas.map((o) => `${o.codigo_ot} (${o.estado})`).join(', ')}`);
      }
      await tx`UPDATE proyecto SET estado = ${a} WHERE id = ${id}`;
      await auditar(
        { usuarioId: ctx.usuarioId, accion: a === 'CERRADO' ? 'proyecto.cerrar' : 'proyecto.cancelar', recurso: 'proyecto', recursoId: id, ip: ctx.ip, metadata: { motivo: motivo ?? null } },
        tx
      );
      return { id, estado: a };
    });
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}

/**
 * Asociar una OT DIRECTA (sin presupuesto) a un proyecto ABIERTO del mismo cliente, o quitarla.
 * Las OTs que nacieron de un presupuesto no cambian de proyecto.
 */
export async function asociarProyectoOT(ctx: Ctx, otId: string, proyectoId: string | null, updatedAt: string) {
  await esperarAvanceReloj(updatedAt);
  try {
    return await sql.begin(async (tx) => {
      const [ot] = await tx`SELECT cliente_id, estado, presupuesto_id, updated_at FROM orden_trabajo WHERE id = ${otId} FOR UPDATE`;
      if (!ot) throw new ErrorApp(404, 'OT no encontrada');
      verificarUpdatedAt(ot.updated_at, updatedAt);
      if (ot.presupuesto_id) throw new ErrorApp(409, 'La OT nació de un presupuesto: su proyecto no se cambia');
      if (esEstadoFinal(ot.estado as EstadoOT)) throw new ErrorApp(400, 'La OT está en estado final');
      if (proyectoId) {
        const [py] = await tx`SELECT estado, cliente_id FROM proyecto WHERE id = ${proyectoId} FOR SHARE`;
        if (!py || py.cliente_id !== ot.cliente_id) throw new ErrorApp(400, 'Proyecto inexistente o de otro cliente');
        if (py.estado !== 'ABIERTO') throw new ErrorApp(409, `El proyecto está ${py.estado}`);
      }
      const [r] = await tx`UPDATE orden_trabajo SET proyecto_id = ${proyectoId} WHERE id = ${otId} RETURNING id, proyecto_id, updated_at`;
      await auditar(
        { usuarioId: ctx.usuarioId, accion: 'ot.asociar_proyecto', recurso: 'orden_trabajo', recursoId: otId, ip: ctx.ip, metadata: { proyectoId } },
        tx
      );
      return r;
    });
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}
