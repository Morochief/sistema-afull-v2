import type { TransactionSql } from 'postgres';
import { sql } from '../../db/client.js';
import { auditar } from '../auditoria/service.js';
import { publicarLive } from '../live/publicar.js';
import { TIPOS_CON_MERMA, esEstadoFinal, type EstadoOT } from '@afull/shared';
import { ErrorApp, traducirErrorPg } from '../../lib/errores.js';
import type { Ctx } from '../clientes/service.js';

/** Tanda abierta de una tarea: su tarea principal todavía no está LISTO ni CANCELADA (Loop 12). */
export type TandaAbierta = { id: string; principalId: string; tareas: string[] };

export async function tandaAbiertaDe(tx: TransactionSql, tareaId: string): Promise<TandaAbierta | null> {
  const [t] = await tx<{ id: string; principal: string }[]>`
    SELECT ta.id, ta.tarea_principal_id AS principal
    FROM tanda_tarea tt JOIN tanda ta ON ta.id = tt.tanda_id JOIN tarea p ON p.id = ta.tarea_principal_id
    WHERE tt.tarea_id = ${tareaId} AND p.estado NOT IN ('LISTO', 'CANCELADA')
    ORDER BY ta.created_at DESC LIMIT 1
  `;
  if (!t) return null;
  const tareas = await tx<{ tarea_id: string }[]>`SELECT tarea_id FROM tanda_tarea WHERE tanda_id = ${t.id} ORDER BY orden`;
  return { id: t.id, principalId: t.principal, tareas: tareas.map((x) => x.tarea_id) };
}

/** La tarea es parte de una tanda abierta pero no es la principal: se opera desde la tarjeta de la tanda. */
export async function exigirNoSecundaria(tx: TransactionSql, tareaId: string) {
  const tanda = await tandaAbiertaDe(tx, tareaId);
  if (tanda && tanda.principalId !== tareaId) {
    throw new ErrorApp(409, 'Esta tarea es parte de una tanda compartida: se maneja desde la tarjeta de la tanda');
  }
  return tanda;
}

/** Lleva las tareas secundarias de la tanda al mismo estado que la principal, con su evento. */
export async function moverSecundarias(tx: TransactionSql, tanda: TandaAbierta, estado: 'EN_CURSO' | 'PAUSADA' | 'LISTO', autorId: string) {
  for (const id of tanda.tareas.filter((x) => x !== tanda.principalId)) {
    const [t] = await tx<{ estado: string }[]>`SELECT estado FROM tarea WHERE id = ${id} FOR UPDATE`;
    if (!t || t.estado === estado) continue;
    await tx`UPDATE tarea SET estado = ${estado}, updated_at = now() WHERE id = ${id}`;
    await tx`INSERT INTO tarea_evento (tarea_id, estado_anterior, estado_nuevo, autor_id, comentario)
             VALUES (${id}, ${t.estado}, ${estado}, ${autorId}, ${'Tanda compartida'})`;
  }
}

/** Al reanudar, todas las OTs de la tanda tienen que seguir abiertas (si una se terminó, su costo ya está congelado). */
export async function exigirOTsAbiertas(tx: TransactionSql, tanda: TandaAbierta) {
  for (const id of tanda.tareas) {
    const [o] = await tx<{ codigo_ot: string; estado: string }[]>`
      SELECT ot.codigo_ot, ot.estado FROM tarea t JOIN orden_trabajo ot ON ot.id = t.orden_trabajo_id WHERE t.id = ${id} FOR SHARE OF ot`;
    if (o && esEstadoFinal(o.estado as EstadoOT)) throw new ErrorApp(409, `${o.codigo_ot} ya está ${o.estado}: finalizá la tanda`);
  }
}

type Item = { tareaId: string; m2Piezas: number };

export async function crearTanda(ctx: Ctx, items: Item[], claveIdempotencia: string) {
  try {
    const r = await sql.begin(async (tx) => {
      const [u] = await tx<{ persona_id: string | null }[]>`SELECT persona_id FROM usuario WHERE id = ${ctx.usuarioId}`;
      if (!u?.persona_id) throw new ErrorApp(403, 'Tu usuario no está vinculado a una persona');
      const [persona] = await tx<{ id: string; activo: boolean }[]>`SELECT id, activo FROM persona WHERE id = ${u.persona_id} FOR UPDATE`;
      if (!persona?.activo) throw new ErrorApp(403, 'Persona vinculada inexistente o inactiva');

      const [previa] = await tx<{ id: string; principal: string }[]>`
        SELECT id, tarea_principal_id AS principal FROM tanda WHERE clave_idempotencia = ${claveIdempotencia}`;
      if (previa) return { tandaId: previa.id, tareaId: previa.principal, repetida: true };

      if (new Set(items.map((i) => i.tareaId)).size !== items.length) throw new ErrorApp(400, 'Una tarea está repetida');
      const ots = new Set<string>();
      // Se bloquean en orden de id para no cruzarse con otra transacción.
      for (const it of [...items].sort((a, b) => a.tareaId.localeCompare(b.tareaId))) {
        const [t] = await tx<{ persona_asignada_id: string | null; estado: string; tipo: string; orden_trabajo_id: string; ot_estado: string; hoja_estado: string }[]>`
          SELECT t.persona_asignada_id, t.estado, t.tipo, t.orden_trabajo_id, ot.estado AS ot_estado, ot.hoja_estado
          FROM tarea t JOIN orden_trabajo ot ON ot.id = t.orden_trabajo_id
          WHERE t.id = ${it.tareaId} FOR UPDATE OF t FOR SHARE OF ot`;
        if (!t) throw new ErrorApp(404, 'Tarea no encontrada');
        if (t.persona_asignada_id !== persona.id) throw new ErrorApp(403, 'Solo puedes operar tareas asignadas a tu persona');
        if (await tandaAbiertaDe(tx, it.tareaId)) throw new ErrorApp(409, 'Una de las tareas ya está en otra tanda');
        if (!(TIPOS_CON_MERMA as readonly string[]).includes(t.tipo)) throw new ErrorApp(400, 'La tanda es solo para impresión, ploteo, corte o refilado');
        if (!['PENDIENTE', 'PAUSADA'].includes(t.estado)) throw new ErrorApp(400, `Una tarea está ${t.estado}: solo entran pendientes o pausadas`);
        if (esEstadoFinal(t.ot_estado as EstadoOT)) throw new ErrorApp(409, `Una OT ya está ${t.ot_estado}`);
        if (t.hoja_estado === 'BORRADOR') throw new ErrorApp(409, 'La hoja de ruta de una de las OTs todavía está en borrador');
        if (ots.has(t.orden_trabajo_id)) throw new ErrorApp(400, 'Cada tarea de la tanda tiene que ser de una OT distinta');
        ots.add(t.orden_trabajo_id);
      }

      const principal = items[0].tareaId;
      const [tanda] = await tx<{ id: string }[]>`
        INSERT INTO tanda (persona_id, tarea_principal_id, creada_por, clave_idempotencia)
        VALUES (${persona.id}, ${principal}, ${ctx.usuarioId}, ${claveIdempotencia}) RETURNING id`;
      for (const [i, it] of items.entries()) {
        await tx`INSERT INTO tanda_tarea (tanda_id, tarea_id, m2_piezas, orden) VALUES (${tanda.id}, ${it.tareaId}, ${it.m2Piezas}, ${i + 1})`;
      }
      await auditar({ usuarioId: ctx.usuarioId, accion: 'tanda.crear', recurso: 'tanda', recursoId: tanda.id, ip: ctx.ip, metadata: { items } }, tx);
      return { tandaId: tanda.id, tareaId: principal, repetida: false };
    });
    if (!r.repetida) await publicarLive('tanda.crear', r.tandaId);
    return r;
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}
