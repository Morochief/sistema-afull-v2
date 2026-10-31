import { sql } from '../../db/client.js';
import { auditar } from '../auditoria/service.js';
import { puedeTransicionar, type EstadoOT } from '@afull/shared';
import { ErrorApp, traducirErrorPg } from '../../lib/errores.js';
import { TAM_PAGINA, desplazamiento, escaparLike, armarPagina } from '../../lib/paginacion.js';
import type { Ctx } from '../clientes/service.js';

const anioAsuncion = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion', year: 'numeric' }).format(new Date());

export type FiltroOT = { pagina: number; q?: string; estado?: EstadoOT; desde?: string; hasta?: string };

export async function listarOTs(f: FiltroOT) {
  const patron = f.q?.trim() ? `%${escaparLike(f.q.trim())}%` : null;
  const donde = sql`WHERE true
    ${f.estado ? sql`AND estado = ${f.estado}` : sql``}
    ${patron ? sql`AND (titulo ILIKE ${patron} OR codigo_ot ILIKE ${patron})` : sql``}
    ${f.desde ? sql`AND created_at >= (${f.desde}::date)::timestamp AT TIME ZONE 'America/Asuncion'` : sql``}
    ${f.hasta ? sql`AND created_at < ((${f.hasta}::date + 1)::timestamp AT TIME ZONE 'America/Asuncion')` : sql``}`;

  try {
    const [{ total }] = await sql`SELECT count(*)::int AS total FROM orden_trabajo ${donde}`;
    const items = await sql`
      SELECT id, codigo_ot, cliente_id, sucursal_id, titulo, estado, fecha_prometida, created_at
      FROM orden_trabajo ${donde}
      ORDER BY created_at DESC, id LIMIT ${TAM_PAGINA} OFFSET ${desplazamiento(f.pagina)}
    `;
    return armarPagina([...items], total, f.pagina);
  } catch (e) {
    traducirErrorPg(e);
  }
}

export type NuevaOT = { clienteId: string; sucursalId?: string; titulo: string; descripcion?: string; fechaPrometida?: string };

export async function crearOT(ctx: Ctx, d: NuevaOT) {
  try {
    return await sql.begin(async (tx) => {
      const [c] = await tx`SELECT activo FROM cliente WHERE id = ${d.clienteId}`;
      if (!c?.activo) throw new ErrorApp(400, 'Cliente inexistente o inactivo');
      if (d.sucursalId) {
        const [s] = await tx`SELECT activo FROM sucursal WHERE id = ${d.sucursalId} AND cliente_id = ${d.clienteId}`;
        if (!s?.activo) throw new ErrorApp(400, 'Sucursal inexistente, inactiva o de otro cliente');
      }

      const anio = anioAsuncion();
      const [{ v }] = await tx`SELECT siguiente_valor(${'OT-' + anio}) AS v`;
      const codigo = `OT-${anio}-${String(v).padStart(4, '0')}`;

      const [ot] = await tx`
        INSERT INTO orden_trabajo (codigo_ot, cliente_id, sucursal_id, titulo, descripcion, fecha_prometida, creado_por)
        VALUES (${codigo}, ${d.clienteId}, ${d.sucursalId ?? null}, ${d.titulo}, ${d.descripcion ?? null}, ${d.fechaPrometida ?? null}, ${ctx.usuarioId})
        RETURNING *
      `;
      await tx`
        INSERT INTO ot_evento (orden_trabajo_id, estado_anterior, estado_nuevo, autor_id)
        VALUES (${ot.id}, NULL, 'PENDIENTE', ${ctx.usuarioId})
      `;
      await auditar(
        { usuarioId: ctx.usuarioId, accion: 'ot.crear', recurso: 'orden_trabajo', recursoId: ot.id, ip: ctx.ip, metadata: { codigo } },
        tx,
      );
      return ot;
    });
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}

export type Transicion = { desde: EstadoOT; a: EstadoOT; comentario?: string };

export async function transicionar(ctx: Ctx, id: string, t: Transicion) {
  try {
    return await sql.begin(async (tx) => {
      const [ot] = await tx`SELECT estado FROM orden_trabajo WHERE id = ${id} FOR UPDATE`;
      if (!ot) throw new ErrorApp(404, 'OT no encontrada');
      const actual = ot.estado as EstadoOT;
      if (actual !== t.desde) throw new ErrorApp(409, `La OT ya está en ${actual}; recargue los datos`);
      if (!puedeTransicionar(actual, t.a)) throw new ErrorApp(400, `Transición no permitida: ${actual} → ${t.a}`);
      if (t.a === 'CANCELADO' && !t.comentario?.trim()) throw new ErrorApp(400, 'Cancelar requiere un motivo justificado');

      await tx`UPDATE orden_trabajo SET estado = ${t.a} WHERE id = ${id}`;
      await tx`
        INSERT INTO ot_evento (orden_trabajo_id, estado_anterior, estado_nuevo, autor_id, comentario)
        VALUES (${id}, ${actual}, ${t.a}, ${ctx.usuarioId}, ${t.comentario ?? null})
      `;
      await auditar(
        { usuarioId: ctx.usuarioId, accion: 'ot.cambio_estado', recurso: 'orden_trabajo', recursoId: id, ip: ctx.ip, metadata: { de: actual, a: t.a } },
        tx,
      );
      return { id, estado: t.a };
    });
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}
