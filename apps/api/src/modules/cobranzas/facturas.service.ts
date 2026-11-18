import type { FacturaFila, FiltroFacturas, NuevaFactura, Pagina } from '@afull/shared';
import { sql } from '../../db/client.js';
import { auditar } from '../auditoria/service.js';
import { ErrorApp, traducirErrorPg } from '../../lib/errores.js';
import { TAM_PAGINA, desplazamiento, escaparLike, armarPagina } from '../../lib/paginacion.js';
import type { Ctx } from '../clientes/service.js';

/** Loop 21: facturas ya emitidas por aFull (con su sistema de facturación electrónica) y su saldo. */
export const COLUMNAS_FACTURA = sql`
  f.id, f.numero, f.cliente_id, c.nombre AS cliente_nombre, f.fecha::text AS fecha, f.monto_gs::float8 AS monto_gs,
  f.cobrado_gs::float8 AS cobrado_gs, f.saldo_gs::float8 AS saldo_gs, f.estado, f.nota, f.motivo_anulacion`;

function donde(f: FiltroFacturas) {
  const patron = f.q?.trim() ? `%${escaparLike(f.q.trim())}%` : null;
  const estado = f.estado === 'TODAS' ? sql``
    : f.estado === 'CON_SALDO' ? sql`AND f.estado IN ('PENDIENTE', 'PARCIAL')`
      : sql`AND f.estado = ${f.estado}`;
  return sql`WHERE ${true} ${estado}
    ${f.clienteId ? sql`AND f.cliente_id = ${f.clienteId}` : sql``}
    ${patron ? sql`AND (f.numero ILIKE ${patron} OR c.nombre ILIKE ${patron})` : sql``}
    ${f.desde ? sql`AND f.fecha >= ${f.desde}::date` : sql``}
    ${f.hasta ? sql`AND f.fecha <= ${f.hasta}::date` : sql``}`;
}

export async function listarFacturas(f: FiltroFacturas): Promise<Pagina<FacturaFila> & { saldo_total_gs: number }> {
  const [{ total, saldo }] = await sql`
    SELECT count(*)::int AS total, coalesce(sum(f.saldo_gs), 0)::float8 AS saldo
    FROM v_factura_saldo f JOIN cliente c ON c.id = f.cliente_id ${donde(f)}`;
  const items = await sql<FacturaFila[]>`
    SELECT ${COLUMNAS_FACTURA} FROM v_factura_saldo f JOIN cliente c ON c.id = f.cliente_id ${donde(f)}
    ORDER BY f.fecha DESC, f.numero DESC LIMIT ${TAM_PAGINA} OFFSET ${desplazamiento(f.pagina)}`;
  return { ...armarPagina([...items], total, f.pagina), saldo_total_gs: saldo };
}

export async function crearFactura(ctx: Ctx, d: NuevaFactura) {
  try {
    return await sql.begin(async (tx) => {
      const [c] = await tx`SELECT activo FROM cliente WHERE id = ${d.clienteId}`;
      if (!c) throw new ErrorApp(400, 'Cliente inexistente');
      if (d.ordenTrabajoId) {
        const [o] = await tx`SELECT cliente_id FROM orden_trabajo WHERE id = ${d.ordenTrabajoId}`;
        if (o?.cliente_id !== d.clienteId) throw new ErrorApp(400, 'La OT no es de ese cliente');
      }
      const [dup] = await tx`SELECT id FROM factura_cliente WHERE numero = ${d.numero}`;
      if (dup) throw new ErrorApp(409, `La factura ${d.numero} ya está cargada`);
      const [f] = await tx`
        INSERT INTO factura_cliente (numero, cliente_id, fecha, monto_gs, orden_trabajo_id, proyecto_id, nota, creado_por)
        VALUES (${d.numero}, ${d.clienteId}, ${d.fecha}, ${d.montoGs}, ${d.ordenTrabajoId ?? null}, ${d.proyectoId ?? null},
                ${d.nota ?? null}, ${ctx.usuarioId})
        RETURNING id, numero, monto_gs::float8 AS monto_gs`;
      await auditar({ usuarioId: ctx.usuarioId, accion: 'factura.crear', recurso: 'factura_cliente', recursoId: f.id, ip: ctx.ip,
        metadata: { numero: d.numero, monto_gs: d.montoGs } }, tx);
      return f;
    });
  } catch (e) {
    traducirErrorPg(e);
  }
}

export async function anularFactura(ctx: Ctx, id: string, motivo: string) {
  return sql.begin(async (tx) => {
    const [f] = await tx`SELECT anulada_at FROM factura_cliente WHERE id = ${id} FOR UPDATE`;
    if (!f) throw new ErrorApp(404, 'Factura no encontrada');
    if (f.anulada_at) throw new ErrorApp(409, 'La factura ya está anulada');
    const [cob] = await tx`SELECT count(*)::int AS n FROM recibo_aplicacion a JOIN recibo r ON r.id = a.recibo_id
      WHERE a.factura_id = ${id} AND r.anulado_at IS NULL`;
    if (cob.n > 0) throw new ErrorApp(409, 'La factura tiene cobros: anulá primero los recibos');
    await tx`UPDATE factura_cliente SET anulada_at = now(), anulada_por = ${ctx.usuarioId}, motivo_anulacion = ${motivo} WHERE id = ${id}`;
    await auditar({ usuarioId: ctx.usuarioId, accion: 'factura.anular', recurso: 'factura_cliente', recursoId: id, ip: ctx.ip, metadata: { motivo } }, tx);
    return { id, estado: 'ANULADA' as const };
  });
}

export async function saldoCliente(clienteId: string) {
  const [s] = await sql`
    SELECT coalesce(sum(saldo_gs), 0)::float8 AS saldo_gs, count(*) FILTER (WHERE saldo_gs > 0)::int AS facturas_pendientes
    FROM v_factura_saldo WHERE cliente_id = ${clienteId}`;
  return s as { saldo_gs: number; facturas_pendientes: number };
}
