import { sql } from '../../db/client.js';
import { auditar } from '../auditoria/service.js';
import { puedeTransicionar, esEstadoFinal, type EstadoOT, type OTDetalle, type OTFila, type Pagina } from '@afull/shared';
import { ErrorApp, traducirErrorPg } from '../../lib/errores.js';
import { TAM_PAGINA, desplazamiento, escaparLike, armarPagina } from '../../lib/paginacion.js';
import { type Ctx, esperarAvanceReloj, verificarUpdatedAt } from '../clientes/service.js';
import { insertarTareasIniciales, type ItemTareaInput } from './tareas.service.js';

const anioAsuncion = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion', year: 'numeric' }).format(new Date());

export type FiltroOT = {
  pagina: number;
  q?: string;
  estado?: EstadoOT;
  clienteId?: string;
  desde?: string;
  hasta?: string;
};

function dondeOTs(f: FiltroOT) {
  const patron = f.q?.trim() ? `%${escaparLike(f.q.trim())}%` : null;
  // Se parametriza ${true} para que incluso sin filtros la consulta tenga >= 1 parámetro (describeFirst = true en pooler 6543)
  return sql`WHERE ${true}
    ${f.estado ? sql`AND o.estado = ${f.estado}` : sql``}
    ${f.clienteId ? sql`AND o.cliente_id = ${f.clienteId}` : sql``}
    ${patron ? sql`AND (o.titulo ILIKE ${patron} OR o.codigo_ot ILIKE ${patron} OR c.nombre ILIKE ${patron})` : sql``}
    ${f.desde ? sql`AND o.created_at >= (${f.desde}::date)::timestamp AT TIME ZONE 'America/Asuncion'` : sql``}
    ${f.hasta ? sql`AND o.created_at < ((${f.hasta}::date + 1)::timestamp AT TIME ZONE 'America/Asuncion')` : sql``}`;
}

export async function listarOTs(f: FiltroOT): Promise<Pagina<OTFila>> {
  try {
    const [{ total }] = await sql`
      SELECT count(*)::int AS total
      FROM orden_trabajo o
      JOIN cliente c ON c.id = o.cliente_id
      LEFT JOIN sucursal s ON s.id = o.sucursal_id
      ${dondeOTs(f)}
    `;
    const items = await sql`
      SELECT
        o.id,
        o.codigo_ot,
        o.cliente_id,
        c.nombre AS cliente_nombre,
        o.sucursal_id,
        s.nombre AS sucursal_nombre,
        o.titulo,
        o.descripcion,
        o.estado,
        o.fecha_prometida,
        o.created_at,
        o.updated_at
      FROM orden_trabajo o
      JOIN cliente c ON c.id = o.cliente_id
      LEFT JOIN sucursal s ON s.id = o.sucursal_id
      ${dondeOTs(f)}
      ORDER BY o.created_at DESC, o.id LIMIT ${TAM_PAGINA} OFFSET ${desplazamiento(f.pagina)}
    `;
    return armarPagina([...items], total, f.pagina) as Pagina<OTFila>;
  } catch (e) {
    traducirErrorPg(e);
  }
}

export async function obtenerDetalleOT(id: string): Promise<OTDetalle> {
  try {
    const [ot] = await sql`
      SELECT
        o.id,
        o.codigo_ot,
        o.cliente_id,
        c.nombre AS cliente_nombre,
        o.sucursal_id,
        s.nombre AS sucursal_nombre,
        o.titulo,
        o.descripcion,
        o.estado,
        o.fecha_prometida,
        o.creado_por,
        o.created_at,
        o.updated_at
      FROM orden_trabajo o
      JOIN cliente c ON c.id = o.cliente_id
      LEFT JOIN sucursal s ON s.id = o.sucursal_id
      WHERE o.id = ${id}
    `;
    if (!ot) throw new ErrorApp(404, 'OT no encontrada');

    const eventos = await sql`
      SELECT id, orden_trabajo_id, estado_anterior, estado_nuevo, autor_id, comentario, created_at
      FROM ot_evento WHERE orden_trabajo_id = ${id}
      ORDER BY created_at ASC, id ASC
    `;
    return { ...ot, eventos: [...eventos] } as unknown as OTDetalle;
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}

export type NuevaOT = {
  clienteId: string;
  sucursalId?: string;
  titulo: string;
  descripcion?: string;
  fechaPrometida?: string;
  tareas?: ItemTareaInput[];
};

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
      if (d.tareas && d.tareas.length > 0) {
        await insertarTareasIniciales(tx, ctx, ot.id as string, d.tareas);
      }
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

export type PatchOT = {
  titulo?: string;
  descripcion?: string | null;
  fechaPrometida?: string | null;
  sucursalId?: string | null;
  updatedAt: string;
};

export async function editarOT(ctx: Ctx, id: string, d: PatchOT) {
  await esperarAvanceReloj(d.updatedAt);
  try {
    return await sql.begin(async (tx) => {
      const [actual] = await tx`SELECT * FROM orden_trabajo WHERE id = ${id} FOR UPDATE`;
      if (!actual) throw new ErrorApp(404, 'OT no encontrada');
      verificarUpdatedAt(actual.updated_at, d.updatedAt);

      if (esEstadoFinal(actual.estado as EstadoOT)) {
        throw new ErrorApp(400, `No se puede editar una OT en estado final (${actual.estado})`);
      }

      if (d.sucursalId !== undefined && d.sucursalId !== null) {
        const [s] = await tx`SELECT activo FROM sucursal WHERE id = ${d.sucursalId} AND cliente_id = ${actual.cliente_id}`;
        if (!s?.activo) throw new ErrorApp(400, 'Sucursal inexistente, inactiva o de otro cliente');
      }

      const titulo = d.titulo ?? actual.titulo;
      const descripcion = d.descripcion === undefined ? actual.descripcion : d.descripcion;
      const fechaPrometida = d.fechaPrometida === undefined ? actual.fecha_prometida : d.fechaPrometida;
      const sucursalId = d.sucursalId === undefined ? actual.sucursal_id : d.sucursalId;

      const [ot] = await tx`
        UPDATE orden_trabajo
        SET titulo = ${titulo}, descripcion = ${descripcion}, fecha_prometida = ${fechaPrometida}, sucursal_id = ${sucursalId}
        WHERE id = ${id}
        RETURNING *
      `;
      await auditar(
        { usuarioId: ctx.usuarioId, accion: 'ot.editar', recurso: 'orden_trabajo', recursoId: id, ip: ctx.ip, metadata: { titulo, sucursalId } },
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
      if (esEstadoFinal(t.a)) {
        // Un cronómetro abierto en una OT cerrada quedaría corriendo para siempre.
        const [{ n }] = await tx<{ n: number }[]>`
          SELECT count(*)::int AS n FROM tarea WHERE orden_trabajo_id = ${id} AND estado = 'EN_CURSO'
        `;
        if (n > 0) throw new ErrorApp(409, `Hay ${n} tarea(s) en curso: el operario debe pausarlas o finalizarlas antes`);
      }

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
