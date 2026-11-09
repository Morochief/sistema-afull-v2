import crypto from 'node:crypto';
import { sql } from '../../db/client.js';
import { auditar } from '../auditoria/service.js';
import { ErrorApp, traducirErrorPg } from '../../lib/errores.js';
import { TAM_PAGINA, desplazamiento, escaparLike, armarPagina } from '../../lib/paginacion.js';
import type { Ctx } from '../clientes/service.js';
import { crearOTEnTx } from '../comercial/ot.service.js';
import { crearPresupuestoEnTx } from '../presupuestos/borrador.service.js';
import { hashTokenPortal } from './cliente.routes.js';

/** Genera un enlace: el token se devuelve UNA sola vez (en la base queda su SHA-256). */
export async function crearAcceso(ctx: Ctx, d: { clienteId: string; descripcion: string; diasVigencia: number }) {
  const token = crypto.randomBytes(32).toString('base64url');
  try {
    return await sql.begin(async (tx) => {
      const [c] = await tx`SELECT activo FROM cliente WHERE id = ${d.clienteId}`;
      if (!c?.activo) throw new ErrorApp(400, 'Cliente inexistente o inactivo');
      const [a] = await tx`
        INSERT INTO portal_acceso (cliente_id, descripcion, token_hash, expira_at, creado_por)
        VALUES (${d.clienteId}, ${d.descripcion}, ${hashTokenPortal(token)}, now() + make_interval(days => ${d.diasVigencia}), ${ctx.usuarioId})
        RETURNING id, expira_at
      `;
      // Nunca el token en la auditoría.
      await auditar({ usuarioId: ctx.usuarioId, accion: 'portal.crear_acceso', recurso: 'portal_acceso', recursoId: a.id, ip: ctx.ip, metadata: { clienteId: d.clienteId, descripcion: d.descripcion } }, tx);
      return { id: a.id as string, expira_at: a.expira_at as string, token };
    });
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}

export const listarAccesos = async (clienteId: string) => [
  ...(await sql`
    SELECT id, descripcion, activo, expira_at, ultimo_uso_at, created_at, (activo AND expira_at > now()) AS vigente
    FROM portal_acceso WHERE cliente_id = ${clienteId} ORDER BY created_at DESC
  `),
];

export async function revocarAcceso(ctx: Ctx, id: string) {
  return sql.begin(async (tx) => {
    const [a] = await tx`UPDATE portal_acceso SET activo = false WHERE id = ${id} RETURNING id`;
    if (!a) throw new ErrorApp(404, 'Enlace no encontrado');
    await auditar({ usuarioId: ctx.usuarioId, accion: 'portal.revocar_acceso', recurso: 'portal_acceso', recursoId: id, ip: ctx.ip }, tx);
    return { id };
  });
}

const COLUMNAS = sql`
  pe.id, pe.numero, pe.cliente_id, c.nombre AS cliente_nombre, pe.sucursal_id, s.nombre AS sucursal_nombre, pe.descripcion, pe.foto_url,
  pe.estado, pe.motivo_descarte, pe.created_at, pe.resuelto_at, pe.orden_trabajo_id, o.codigo_ot, pe.presupuesto_id, pr.numero AS presupuesto_numero,
  a.descripcion AS cargado_por_contacto,
  (SELECT count(*)::int FROM archivo ar WHERE ar.pedido_id = pe.id AND ar.estado = 'SUBIDO') AS fotos`;
const DESDE = sql`
  FROM pedido pe JOIN cliente c ON c.id = pe.cliente_id LEFT JOIN sucursal s ON s.id = pe.sucursal_id
  LEFT JOIN orden_trabajo o ON o.id = pe.orden_trabajo_id LEFT JOIN presupuesto pr ON pr.id = pe.presupuesto_id
  LEFT JOIN portal_acceso a ON a.id = pe.portal_acceso_id`;

export async function listarPedidos(f: { q?: string; estado?: string; desde?: string; hasta?: string; pagina: number }) {
  const patron = f.q?.trim() ? `%${escaparLike(f.q.trim())}%` : null;
  const donde = sql`WHERE ${true}
    ${f.estado ? sql`AND pe.estado = ${f.estado}` : sql``}
    ${patron ? sql`AND (pe.numero ILIKE ${patron} OR c.nombre ILIKE ${patron} OR pe.descripcion ILIKE ${patron} OR s.nombre ILIKE ${patron})` : sql``}
    ${f.desde ? sql`AND pe.created_at >= (${f.desde}::date)::timestamp AT TIME ZONE 'America/Asuncion'` : sql``}
    ${f.hasta ? sql`AND pe.created_at < ((${f.hasta}::date + 1)::timestamp AT TIME ZONE 'America/Asuncion')` : sql``}`;
  const [{ total }] = await sql`SELECT count(*)::int AS total ${DESDE} ${donde}`;
  const items = await sql`SELECT ${COLUMNAS} ${DESDE} ${donde} ORDER BY pe.created_at DESC, pe.id LIMIT ${TAM_PAGINA} OFFSET ${desplazamiento(f.pagina)}`;
  return armarPagina([...items], total, f.pagina);
}

export async function obtenerPedido(id: string) {
  const [p] = await sql`SELECT ${COLUMNAS} ${DESDE} WHERE pe.id = ${id}`;
  if (!p) throw new ErrorApp(404, 'Pedido no encontrado');
  return p;
}

/** Convierte el pedido en OT o en presupuesto borrador, en la misma transacción. Solo desde NUEVO (409 si ya se resolvió). */
export async function resolverPedido(ctx: Ctx, id: string, r: { a: 'OT' | 'PRESUPUESTO'; titulo?: string } | { descartar: string }) {
  try {
    return await sql.begin(async (tx) => {
      const [p] = await tx`SELECT * FROM pedido WHERE id = ${id} FOR UPDATE`;
      if (!p) throw new ErrorApp(404, 'Pedido no encontrado');
      if (p.estado !== 'NUEVO') throw new ErrorApp(409, 'El pedido ya fue resuelto: recargá los datos');
      let ot: string | null = null;
      let pre: string | null = null;
      if ('descartar' in r) {
        await tx`UPDATE pedido SET estado = 'DESCARTADO', motivo_descarte = ${r.descartar}, resuelto_por = ${ctx.usuarioId} WHERE id = ${id}`;
      } else {
        const titulo = (r.titulo?.trim() || String(p.descripcion)).slice(0, 255);
        const nota = `Pedido ${p.numero} del portal`;
        if (r.a === 'OT') {
          ot = (await crearOTEnTx(tx, ctx, { clienteId: p.cliente_id, sucursalId: p.sucursal_id ?? undefined, titulo, descripcion: `${nota}: ${p.descripcion}` })).id as string;
        } else {
          pre = (await crearPresupuestoEnTx(tx, ctx, { clienteId: p.cliente_id, titulo, notas: `${nota}: ${p.descripcion}`, margenPct: 30, validezDias: 15 })).id as string;
        }
        await tx`UPDATE pedido SET estado = 'CONVERTIDO', orden_trabajo_id = ${ot}, presupuesto_id = ${pre}, resuelto_por = ${ctx.usuarioId} WHERE id = ${id}`;
      }
      await auditar({ usuarioId: ctx.usuarioId, accion: 'pedido.resolver', recurso: 'pedido', recursoId: id, ip: ctx.ip, metadata: { ot, presupuesto: pre, descartado: 'descartar' in r } }, tx);
      return { id, orden_trabajo_id: ot, presupuesto_id: pre };
    });
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}
