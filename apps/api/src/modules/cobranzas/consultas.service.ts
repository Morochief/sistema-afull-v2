import { montoEnLetras, type EmpresaDatoInput, type FiltroRecibos, type Pagina, type ReciboFila } from '@afull/shared';
import { sql } from '../../db/client.js';
import { auditar } from '../auditoria/service.js';
import { ErrorApp } from '../../lib/errores.js';
import { TAM_PAGINA, desplazamiento, escaparLike, armarPagina } from '../../lib/paginacion.js';
import type { Ctx } from '../clientes/service.js';

/** Loop 21: lectura de recibos (oficina y portal) y datos de aFull para el encabezado. */
const COLUMNAS_RECIBO = sql`
  r.id, r.numero, r.cliente_id, c.nombre AS cliente_nombre, r.fecha::text AS fecha, r.importe_gs::float8 AS importe_gs,
  r.retenciones_gs::float8 AS retenciones_gs, r.medio, r.anulado_at`;

function donde(f: Partial<FiltroRecibos>) {
  const patron = f.q?.trim() ? `%${escaparLike(f.q.trim())}%` : null;
  return sql`WHERE ${true}
    ${f.estado === 'VIGENTE' ? sql`AND r.anulado_at IS NULL` : f.estado === 'ANULADO' ? sql`AND r.anulado_at IS NOT NULL` : sql``}
    ${f.clienteId ? sql`AND r.cliente_id = ${f.clienteId}` : sql``}
    ${patron ? sql`AND (r.numero ILIKE ${patron} OR c.nombre ILIKE ${patron} OR r.referencia ILIKE ${patron})` : sql``}
    ${f.desde ? sql`AND r.fecha >= ${f.desde}::date` : sql``}
    ${f.hasta ? sql`AND r.fecha <= ${f.hasta}::date` : sql``}`;
}

export async function listarRecibos(f: FiltroRecibos): Promise<Pagina<ReciboFila> & { cobrado_total_gs: number }> {
  const [{ total, cobrado }] = await sql`
    SELECT count(*)::int AS total, coalesce(sum(r.importe_gs) FILTER (WHERE r.anulado_at IS NULL), 0)::float8 AS cobrado
    FROM recibo r JOIN cliente c ON c.id = r.cliente_id ${donde(f)}`;
  const items = await sql<ReciboFila[]>`
    SELECT ${COLUMNAS_RECIBO} FROM recibo r JOIN cliente c ON c.id = r.cliente_id ${donde(f)}
    ORDER BY r.created_at DESC, r.id LIMIT ${TAM_PAGINA} OFFSET ${desplazamiento(f.pagina)}`;
  return { ...armarPagina([...items], total, f.pagina), cobrado_total_gs: cobrado };
}

export async function obtenerEmpresa() {
  const [e] = await sql`SELECT razon_social, ruc, direccion, ciudad, telefono, email FROM empresa_dato WHERE id = ${1}`;
  return e ?? null;
}

export async function guardarEmpresa(ctx: Ctx, d: EmpresaDatoInput) {
  return sql.begin(async (tx) => {
    const v = [d.razonSocial, d.ruc, d.direccion ?? null, d.ciudad ?? null, d.telefono ?? null, d.email ?? null] as const;
    const [e] = await tx`
      INSERT INTO empresa_dato (id, razon_social, ruc, direccion, ciudad, telefono, email, updated_por)
      VALUES (${1}, ${v[0]}, ${v[1]}, ${v[2]}, ${v[3]}, ${v[4]}, ${v[5]}, ${ctx.usuarioId})
      ON CONFLICT (id) DO UPDATE SET razon_social = EXCLUDED.razon_social, ruc = EXCLUDED.ruc, direccion = EXCLUDED.direccion,
        ciudad = EXCLUDED.ciudad, telefono = EXCLUDED.telefono, email = EXCLUDED.email, updated_at = now(), updated_por = EXCLUDED.updated_por
      RETURNING razon_social, ruc, direccion, ciudad, telefono, email`;
    await auditar({ usuarioId: ctx.usuarioId, accion: 'empresa.datos', recurso: 'empresa_dato', recursoId: '1', ip: ctx.ip,
      metadata: { razon_social: d.razonSocial, ruc: d.ruc } }, tx);
    return e;
  });
}

/**
 * Recibo completo para ver e imprimir. `clienteId` (portal): solo si es de ese cliente (si no, 404) y sin datos
 * internos (nota, quién lo emitió).
 */
export async function obtenerRecibo(id: string, opciones: { clienteId?: string } = {}) {
  const [r] = await sql`
    SELECT ${COLUMNAS_RECIBO}, r.retencion_numero, r.banco, r.referencia, r.cobrador_nombre, r.created_at, r.motivo_anulacion,
           r.nota, c.ruc AS cliente_ruc
    FROM recibo r JOIN cliente c ON c.id = r.cliente_id
    WHERE r.id = ${id} ${opciones.clienteId ? sql`AND r.cliente_id = ${opciones.clienteId}` : sql``}`;
  if (!r) throw new ErrorApp(404, 'Recibo no encontrado');
  const aplicaciones = await sql`
    SELECT a.factura_id, f.numero, f.fecha::text AS fecha, f.monto_gs::float8 AS monto_factura_gs, a.monto_gs::float8 AS monto_gs
    FROM recibo_aplicacion a JOIN factura_cliente f ON f.id = a.factura_id
    WHERE a.recibo_id = ${id} ORDER BY f.fecha, f.numero`;
  const { cliente_ruc, nota, ...resto } = r;
  return {
    ...resto,
    ...(opciones.clienteId ? {} : { nota }),
    monto_letras: montoEnLetras(Number(r.importe_gs)),
    cliente: { nombre: r.cliente_nombre, ruc: cliente_ruc },
    empresa: await obtenerEmpresa(),
    aplicaciones: [...aplicaciones],
  };
}
