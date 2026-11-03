import { sql } from '../../db/client.js';
import type { TransactionSql } from 'postgres';
import { calcularTotalPresupuesto, puedeTransicionarPresupuesto, type EstadoPresupuesto } from '@afull/shared';
import { auditar } from '../auditoria/service.js';
import { ErrorApp, traducirErrorPg } from '../../lib/errores.js';
import type { Ctx } from '../clientes/service.js';

export type Cabecera = { id: string; numero: string; version: number; cliente_id: string; estado: EstadoPresupuesto; margen: string };

/** `FOR UPDATE` + control de `desde` (409 si otro usuario cambió el estado). */
export async function bloquear(tx: TransactionSql, id: string, desde: EstadoPresupuesto, a: EstadoPresupuesto | null) {
  const [p] = await tx<Cabecera[]>`
    SELECT id, numero, version, cliente_id, estado, margen_pct::text AS margen FROM presupuesto WHERE id = ${id} FOR UPDATE
  `;
  if (!p) throw new ErrorApp(404, 'Presupuesto no encontrado');
  if (p.estado !== desde) throw new ErrorApp(409, `El presupuesto ya está ${p.estado}; recargue los datos`);
  if (a && !puedeTransicionarPresupuesto(p.estado, a)) throw new ErrorApp(400, `Transición no permitida: ${p.estado} → ${a}`);
  return p;
}

export async function registrar(tx: TransactionSql, ctx: Ctx, p: Cabecera, a: EstadoPresupuesto, comentario: string | null) {
  await tx`
    INSERT INTO presupuesto_evento (presupuesto_id, estado_anterior, estado_nuevo, autor_id, comentario)
    VALUES (${p.id}, ${p.estado}, ${a}, ${ctx.usuarioId}, ${comentario})
  `;
  await auditar(
    { usuarioId: ctx.usuarioId, accion: 'presupuesto.cambio_estado', recurso: 'presupuesto', recursoId: p.id, ip: ctx.ip, metadata: { de: p.estado, a } },
    tx
  );
}

export function exigirComentario(comentario: string | undefined, accion: string): string {
  const c = comentario?.trim();
  if (!c) throw new ErrorApp(400, `${accion} requiere un comentario`);
  return c;
}

export async function conTransaccion<T>(fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
  try {
    return (await sql.begin(fn)) as T;
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}

/** Calcula y congela el total EN EL SERVIDOR, con los valores de la base como texto (aritmética exacta). */
export function enviarPresupuesto(ctx: Ctx, id: string, desde: EstadoPresupuesto) {
  return conTransaccion(async (tx) => {
    const p = await bloquear(tx, id, desde, 'ENVIADO');
    const items = await tx<{ cantidad: string; precio_unitario_gs: string; sucursal_id: string | null }[]>`
      SELECT cantidad::text AS cantidad, precio_unitario_gs::text AS precio_unitario_gs, sucursal_id
      FROM presupuesto_item WHERE presupuesto_id = ${id} AND activo
    `;
    if (items.length === 0) throw new ErrorApp(400, 'El presupuesto no tiene ítems activos');
    const conSucursal = items.filter((i) => i.sucursal_id !== null).length;
    if (conSucursal !== 0 && conSucursal !== items.length) {
      throw new ErrorApp(400, 'O todos los ítems tienen sucursal o ninguno: completá la sucursal de los que faltan');
    }
    const total = calcularTotalPresupuesto(items, p.margen);
    await tx`UPDATE presupuesto SET estado = 'ENVIADO', total_gs = ${total}, enviado_at = now() WHERE id = ${id}`;
    await registrar(tx, ctx, p, 'ENVIADO', null);
    return { id, estado: 'ENVIADO' as const, total_gs: total };
  });
}

export function rechazarPresupuesto(ctx: Ctx, id: string, desde: EstadoPresupuesto, comentario?: string) {
  return conTransaccion(async (tx) => {
    const motivo = exigirComentario(comentario, 'Rechazar');
    const p = await bloquear(tx, id, desde, 'RECHAZADO');
    await tx`UPDATE presupuesto SET estado = 'RECHAZADO' WHERE id = ${id}`;
    await registrar(tx, ctx, p, 'RECHAZADO', motivo);
    return { id, estado: 'RECHAZADO' as const };
  });
}

export function anularPresupuesto(ctx: Ctx, id: string, desde: EstadoPresupuesto, comentario?: string) {
  return conTransaccion(async (tx) => {
    const motivo = exigirComentario(comentario, 'Anular');
    const p = await bloquear(tx, id, desde, 'ANULADO');
    await tx`UPDATE presupuesto SET estado = 'ANULADO' WHERE id = ${id}`;
    await registrar(tx, ctx, p, 'ANULADO', motivo);
    return { id, estado: 'ANULADO' as const };
  });
}

/**
 * Nueva versión desde ENVIADO (el original pasa a REEMPLAZADO) o desde RECHAZADO (queda como está).
 * Se bloquean TODAS las versiones del número: dos pedidos simultáneos no pueden crear la misma versión.
 */
export function nuevaVersion(ctx: Ctx, id: string, desde: EstadoPresupuesto) {
  return conTransaccion(async (tx) => {
    if (desde !== 'ENVIADO' && desde !== 'RECHAZADO') {
      throw new ErrorApp(400, 'Solo se versiona un presupuesto ENVIADO o RECHAZADO');
    }
    const [ref] = await tx`SELECT numero FROM presupuesto WHERE id = ${id}`;
    if (!ref) throw new ErrorApp(404, 'Presupuesto no encontrado');
    const versiones = await tx<{ id: string; version: number; estado: string }[]>`
      SELECT id, version, estado FROM presupuesto WHERE numero = ${ref.numero as string} ORDER BY version FOR UPDATE
    `;
    const p = await bloquear(tx, id, desde, desde === 'ENVIADO' ? 'REEMPLAZADO' : null);
    const ultima = versiones[versiones.length - 1];
    if (ultima.id !== id) throw new ErrorApp(409, `Ya existe la versión ${ultima.version}; trabajá sobre esa`);

    if (desde === 'ENVIADO') {
      await tx`UPDATE presupuesto SET estado = 'REEMPLAZADO' WHERE id = ${id}`;
      await registrar(tx, ctx, p, 'REEMPLAZADO', `Reemplazado por la versión ${p.version + 1}`);
    }
    const [nuevo] = await tx`
      INSERT INTO presupuesto (numero, version, cliente_id, titulo, notas, margen_pct, validez_dias, creado_por)
      SELECT numero, version + 1, cliente_id, titulo, notas, margen_pct, validez_dias, ${ctx.usuarioId}
      FROM presupuesto WHERE id = ${id}
      RETURNING id, numero, version, estado, updated_at
    `;
    await tx`
      INSERT INTO presupuesto_item
        (presupuesto_id, cliente_id, sucursal_id, orden, concepto, descripcion, cantidad, unidad, precio_unitario_gs)
      SELECT ${nuevo.id}, cliente_id, sucursal_id, orden, concepto, descripcion, cantidad, unidad, precio_unitario_gs
      FROM presupuesto_item WHERE presupuesto_id = ${id} AND activo
    `;
    await tx`
      INSERT INTO presupuesto_evento (presupuesto_id, estado_anterior, estado_nuevo, autor_id, comentario)
      VALUES (${nuevo.id}, NULL, 'BORRADOR', ${ctx.usuarioId}, ${`Versión ${nuevo.version} a partir de la ${p.version}`})
    `;
    await auditar(
      { usuarioId: ctx.usuarioId, accion: 'presupuesto.nueva_version', recurso: 'presupuesto', recursoId: nuevo.id, ip: ctx.ip, metadata: { origen: id, version: nuevo.version } },
      tx
    );
    return nuevo;
  });
}
