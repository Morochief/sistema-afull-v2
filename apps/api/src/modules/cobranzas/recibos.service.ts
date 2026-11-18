import type { NuevoRecibo } from '@afull/shared';
import { sql } from '../../db/client.js';
import { auditar } from '../auditoria/service.js';
import { ErrorApp, traducirErrorPg } from '../../lib/errores.js';
import type { Ctx } from '../clientes/service.js';

/** Loop 21: emitir y anular recibos de dinero. Las reglas de saldo también las cuida la base (0026). */
const anioAsuncion = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion', year: 'numeric' }).format(new Date());
const RESUMEN = sql`id, numero, cliente_id, fecha::text AS fecha, importe_gs::float8 AS importe_gs, retenciones_gs::float8 AS retenciones_gs, medio`;

export async function crearRecibo(ctx: Ctx, d: NuevoRecibo): Promise<{ recibo: Record<string, unknown>; nuevo: boolean }> {
  const [previo] = await sql`SELECT ${RESUMEN} FROM recibo WHERE clave_idempotencia = ${d.claveIdempotencia}`;
  if (previo) return { recibo: previo, nuevo: false };
  const bruto = d.aplicaciones.reduce((s, a) => s + a.montoGs, 0);
  const importe = bruto - d.retencionesGs;
  if (importe <= 0) throw new ErrorApp(400, 'El importe del recibo (facturas menos retenciones) tiene que ser mayor a cero');
  try {
    return await sql.begin(async (tx) => {
      const [c] = await tx`SELECT id FROM cliente WHERE id = ${d.clienteId}`;
      if (!c) throw new ErrorApp(400, 'Cliente inexistente');
      // Bloquea las facturas en orden fijo (evita interbloqueos) y revisa cliente y saldo.
      for (const a of [...d.aplicaciones].sort((x, y) => x.facturaId.localeCompare(y.facturaId))) {
        const [f] = await tx`SELECT numero, cliente_id, anulada_at FROM factura_cliente WHERE id = ${a.facturaId} FOR UPDATE`;
        if (!f || f.cliente_id !== d.clienteId) throw new ErrorApp(400, 'Una de las facturas no es de este cliente');
        if (f.anulada_at) throw new ErrorApp(400, `La factura ${f.numero} está anulada`);
        const [s] = await tx`SELECT saldo_gs::float8 AS saldo FROM v_factura_saldo WHERE id = ${a.facturaId}`;
        if (a.montoGs > s.saldo) throw new ErrorApp(400, `A la factura ${f.numero} le quedan ${s.saldo} Gs por cobrar`);
      }
      const [u] = await tx`SELECT coalesce(p.nombre, u.username) AS nombre FROM usuario u LEFT JOIN persona p ON p.id = u.persona_id
        WHERE u.id = ${ctx.usuarioId}`;
      const anio = anioAsuncion();
      const [{ v }] = await tx`SELECT siguiente_valor(${'REC-' + anio}) AS v`;
      const numero = `REC-${anio}-${String(v).padStart(4, '0')}`;
      const [r] = await tx`
        INSERT INTO recibo (numero, cliente_id, fecha, importe_gs, retenciones_gs, retencion_numero, medio, banco, referencia, nota,
                            cobrador_nombre, emitido_por, clave_idempotencia)
        VALUES (${numero}, ${d.clienteId}, ${d.fecha}, ${importe}, ${d.retencionesGs}, ${d.retencionNumero ?? null}, ${d.medio},
                ${d.banco ?? null}, ${d.referencia ?? null}, ${d.nota ?? null}, ${u.nombre}, ${ctx.usuarioId}, ${d.claveIdempotencia})
        RETURNING ${RESUMEN}`;
      for (const a of d.aplicaciones) {
        await tx`INSERT INTO recibo_aplicacion (recibo_id, factura_id, cliente_id, monto_gs)
                 VALUES (${r.id}, ${a.facturaId}, ${d.clienteId}, ${a.montoGs})`;
      }
      await auditar({ usuarioId: ctx.usuarioId, accion: 'recibo.crear', recurso: 'recibo', recursoId: r.id, ip: ctx.ip,
        metadata: { numero, importe_gs: importe, facturas: d.aplicaciones.length } }, tx);
      return { recibo: r, nuevo: true };
    });
  } catch (e) {
    // Mismo recibo mandado dos veces a la vez: el segundo choca con la clave y devuelve el primero.
    if ((e as { code?: string }).code === '23505' && String((e as { constraint_name?: string }).constraint_name).includes('clave')) {
      const [r] = await sql`SELECT ${RESUMEN} FROM recibo WHERE clave_idempotencia = ${d.claveIdempotencia}`;
      if (r) return { recibo: r, nuevo: false };
    }
    if ((e as { code?: string }).code === '23514') throw new ErrorApp(400, 'El cobro pasa el saldo de una factura');
    traducirErrorPg(e);
  }
}

export async function anularRecibo(ctx: Ctx, id: string, motivo: string) {
  return sql.begin(async (tx) => {
    const [r] = await tx`SELECT numero, anulado_at FROM recibo WHERE id = ${id} FOR UPDATE`;
    if (!r) throw new ErrorApp(404, 'Recibo no encontrado');
    if (r.anulado_at) throw new ErrorApp(409, 'El recibo ya está anulado');
    await tx`UPDATE recibo SET anulado_at = now(), anulado_por = ${ctx.usuarioId}, motivo_anulacion = ${motivo} WHERE id = ${id}`;
    await auditar({ usuarioId: ctx.usuarioId, accion: 'recibo.anular', recurso: 'recibo', recursoId: id, ip: ctx.ip,
      metadata: { numero: r.numero, motivo } }, tx);
    return { id, anulado: true };
  });
}
