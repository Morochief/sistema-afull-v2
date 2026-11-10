import type { TransactionSql } from 'postgres';
import { sql } from '../../db/client.js';
import { auditar } from '../auditoria/service.js';
import { ErrorApp, traducirErrorPg } from '../../lib/errores.js';
import type { Ctx } from '../clientes/service.js';
import { mensajeHoja, type TareaHoja } from './hoja.mensaje.js';

type Accion = 'ACTIVAR' | 'CERRAR' | 'REABRIR';
const TRANSICION: Record<Accion, { desde: string; a: string }> = {
  ACTIVAR: { desde: 'BORRADOR', a: 'ACTIVA' },
  CERRAR: { desde: 'ACTIVA', a: 'CERRADA' },
  REABRIR: { desde: 'CERRADA', a: 'ACTIVA' },
};

async function enTx<T>(fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
  try {
    return (await sql.begin(fn)) as T;
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}

async function bloquear(tx: TransactionSql, otId: string) {
  const [o] = await tx`SELECT hoja_estado FROM orden_trabajo WHERE id = ${otId} FOR UPDATE`;
  if (!o) throw new ErrorApp(404, 'OT no encontrada');
  return o.hoja_estado as string;
}

/** Borrador → Activa → Cerrada (y reabrir). `desde` es lo que veía la persona: si cambió, 409. */
export function accionHoja(ctx: Ctx, otId: string, d: { accion: Accion; desde: string }) {
  return enTx(async (tx) => {
    const actual = await bloquear(tx, otId);
    if (actual !== d.desde) throw new ErrorApp(409, `La hoja de ruta cambió: ahora está ${actual}`);
    const t = TRANSICION[d.accion];
    if (actual !== t.desde) throw new ErrorApp(409, `No se puede ${d.accion.toLowerCase()} una hoja ${actual}`);
    if (d.accion === 'CERRAR') {
      const [{ n }] = await tx`SELECT count(*)::int AS n FROM tarea WHERE orden_trabajo_id = ${otId} AND estado IN ('PENDIENTE', 'EN_CURSO', 'PAUSADA')`;
      if (n > 0) throw new ErrorApp(409, `Hay ${n} tarea(s) sin terminar: finalizalas o cancelalas antes de cerrar la hoja`);
    }
    await tx`
      UPDATE orden_trabajo SET hoja_estado = ${t.a},
        hoja_activada_at = CASE WHEN ${t.a} = 'ACTIVA' THEN now() ELSE hoja_activada_at END,
        hoja_cerrada_at = CASE WHEN ${t.a} = 'CERRADA' THEN now() ELSE NULL END
      WHERE id = ${otId}`;
    await auditar({ usuarioId: ctx.usuarioId, accion: `hoja_ruta_ot.${d.accion.toLowerCase()}`, recurso: 'orden_trabajo', recursoId: otId, ip: ctx.ip, metadata: { desde: actual, a: t.a } }, tx);
    return { hoja_estado: t.a };
  });
}

export function notasHoja(ctx: Ctx, otId: string, notas: string | null) {
  return enTx(async (tx) => {
    await bloquear(tx, otId);
    const valor = notas?.trim() || null;
    await tx`UPDATE orden_trabajo SET hoja_notas = ${valor} WHERE id = ${otId}`;
    await auditar({ usuarioId: ctx.usuarioId, accion: 'hoja_ruta_ot.notas', recurso: 'orden_trabajo', recursoId: otId, ip: ctx.ip, metadata: {} }, tx);
    return { hoja_notas: valor };
  });
}

/** Arma el WhatsApp con el formato de siempre; si la hoja estaba en borrador, la activa (como en el sistema viejo). */
export function whatsappHoja(ctx: Ctx, otId: string) {
  return enTx(async (tx) => {
    const actual = await bloquear(tx, otId);
    const estado = actual === 'BORRADOR' ? 'ACTIVA' : actual;
    const [cab] = await tx`
      SELECT c.nombre AS cliente, o.codigo_ot, o.titulo, s.nombre AS sucursal, o.hoja_notas AS notas,
             (now() AT TIME ZONE 'America/Asuncion')::date::text AS hoy
      FROM orden_trabajo o JOIN cliente c ON c.id = o.cliente_id LEFT JOIN sucursal s ON s.id = o.sucursal_id
      WHERE o.id = ${otId}`;
    const tareas = await tx<TareaHoja[]>`
      SELECT p.nombre AS operario, t.descripcion, t.fecha_trabajo::text AS fecha_trabajo, t.cantidad::float8 AS cantidad,
             t.unidad, t.minutos_estimados
      FROM tarea t LEFT JOIN persona p ON p.id = t.persona_asignada_id
      WHERE t.orden_trabajo_id = ${otId} AND t.estado <> 'CANCELADA'
      ORDER BY t.fecha_trabajo NULLS LAST, t.orden_secuencia, t.created_at`;
    await tx`
      UPDATE orden_trabajo SET hoja_estado = ${estado}, hoja_whatsapp_at = now(),
        hoja_activada_at = CASE WHEN ${actual} = 'BORRADOR' THEN now() ELSE hoja_activada_at END
      WHERE id = ${otId}`;
    await auditar({ usuarioId: ctx.usuarioId, accion: 'hoja_ruta_ot.whatsapp', recurso: 'orden_trabajo', recursoId: otId, ip: ctx.ip, metadata: { activo: actual === 'BORRADOR' } }, tx);
    return { mensaje: mensajeHoja(cab as never, [...tareas], cab.hoy as string), estado };
  });
}
