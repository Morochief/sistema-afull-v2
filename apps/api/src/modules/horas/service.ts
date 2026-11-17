import type { TransactionSql } from 'postgres';
import { esEstadoFinal, type EstadoOT } from '@afull/shared';
import { sql } from '../../db/client.js';
import { auditar } from '../auditoria/service.js';
import { publicarLive } from '../live/publicar.js';
import { ErrorApp, traducirErrorPg } from '../../lib/errores.js';
import { moverSecundarias, tandaAbiertaDe } from '../cronometro/tanda.service.js';
import type { Ctx } from '../clientes/service.js';

/**
 * Loop 13: corregir y cargar horas a mano (Juan, Gerardo y Sofi). Las horas siguen siendo eventos inmutables:
 * se cierra un reloj olvidado con la hora real, se agrega una corrección que acorta un tramo cerrado,
 * o se carga un tramo a mano. Nunca sobre OTs terminadas o canceladas (su costo está congelado).
 */
const DIAS_ATRAS = 31;
const HORAS_MAX_TRAMO = 16;

async function enTx<T>(fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
  try {
    return (await sql.begin(fn)) as T;
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}

const ms = (iso: string | Date) => new Date(iso).getTime();
function exigirVentana(inicio: string | Date, fin: string | Date) {
  if (ms(fin) > Date.now()) throw new ErrorApp(400, 'La hora no puede estar en el futuro');
  if (ms(inicio) < Date.now() - DIAS_ATRAS * 86_400_000) throw new ErrorApp(400, `Solo se corrigen horas de los últimos ${DIAS_ATRAS} días`);
}

/** OTs que toca un tramo: la de su tarea y, si es de una tanda, las de todas sus tareas (Loop 12). */
async function exigirOTsAbiertas(tx: TransactionSql, tareaId: string, tandaId: string | null) {
  const ots = await tx<{ codigo_ot: string; estado: string }[]>`
    SELECT DISTINCT o.codigo_ot, o.estado FROM tarea t JOIN orden_trabajo o ON o.id = t.orden_trabajo_id
    WHERE t.id = ${tareaId} OR t.id IN (SELECT tarea_id FROM tanda_tarea WHERE tanda_id = ${tandaId})`;
  const final = ots.find((o) => esEstadoFinal(o.estado as EstadoOT));
  if (final) throw new ErrorApp(409, `${final.codigo_ot} está ${final.estado}: su costo ya está congelado`);
}

type Tramo = { id: string; tarea_id: string; persona_id: string; hora_inicio: Date; hora_fin: Date | null; tanda_id: string | null };
async function tramo(tx: TransactionSql, id: string) {
  const [i] = await tx<Tramo[]>`SELECT id, tarea_id, persona_id, hora_inicio, hora_fin, tanda_id FROM tarea_intervalo WHERE id = ${id} FOR UPDATE`;
  if (!i) throw new ErrorApp(404, 'Tramo de horas no encontrado');
  return i;
}

/** Reloj olvidado (todavía abierto): se cierra con la hora real; la tarea (y su tanda) queda en pausa. */
export async function cerrarConHora(ctx: Ctx, id: string, horaFin: string, motivo: string) {
  const r = await enTx(async (tx) => {
    const i = await tramo(tx, id);
    if (i.hora_fin) throw new ErrorApp(409, 'Ese reloj ya está cerrado: usá "Corregir fin"');
    if (ms(horaFin) < ms(i.hora_inicio)) throw new ErrorApp(400, 'La hora de cierre no puede ser anterior al inicio');
    exigirVentana(i.hora_inicio, horaFin);
    await exigirOTsAbiertas(tx, i.tarea_id, i.tanda_id);
    await tx`UPDATE tarea_intervalo SET hora_fin = ${horaFin}, motivo_cierre = 'CORRECCION', cerrado_por = ${ctx.usuarioId}, motivo_correccion = ${motivo}
             WHERE id = ${id}`;
    const [t] = await tx<{ estado: string }[]>`SELECT estado FROM tarea WHERE id = ${i.tarea_id} FOR UPDATE`;
    if (t.estado === 'EN_CURSO') {
      await tx`UPDATE tarea SET estado = 'PAUSADA', updated_at = now() WHERE id = ${i.tarea_id}`;
      await tx`INSERT INTO tarea_evento (tarea_id, estado_anterior, estado_nuevo, autor_id, comentario)
               VALUES (${i.tarea_id}, 'EN_CURSO', 'PAUSADA', ${ctx.usuarioId}, ${'Reloj cerrado por la oficina: ' + motivo})`;
      const tanda = await tandaAbiertaDe(tx, i.tarea_id);
      if (tanda) await moverSecundarias(tx, tanda, 'PAUSADA', ctx.usuarioId);
    }
    await auditar({ usuarioId: ctx.usuarioId, accion: 'horas.cerrar', recurso: 'tarea_intervalo', recursoId: id, ip: ctx.ip, metadata: { horaFin, motivo } }, tx);
    return { id, tareaId: i.tarea_id };
  });
  await publicarLive('tarea.pausar', r.tareaId);
  return { id: r.id };
}

/** Tramo cerrado que quedó largo: una corrección que solo acorta, una vez. El tramo original no cambia. */
export async function corregirFin(ctx: Ctx, id: string, horaFin: string, motivo: string) {
  return enTx(async (tx) => {
    const i = await tramo(tx, id);
    if (!i.hora_fin) throw new ErrorApp(409, 'Ese reloj sigue abierto: usá "Cerrar con hora"');
    const [ya] = await tx`SELECT 1 FROM intervalo_correccion WHERE intervalo_id = ${id}`;
    if (ya) throw new ErrorApp(409, 'Ese tramo ya fue corregido');
    if (ms(horaFin) < ms(i.hora_inicio) || ms(horaFin) >= ms(i.hora_fin)) throw new ErrorApp(400, 'La corrección solo puede acortar el tramo (entre el inicio y el fin actual)');
    exigirVentana(i.hora_inicio, horaFin);
    await exigirOTsAbiertas(tx, i.tarea_id, i.tanda_id);
    await tx`INSERT INTO intervalo_correccion (intervalo_id, hora_fin_corregida, motivo, corregido_por) VALUES (${id}, ${horaFin}, ${motivo}, ${ctx.usuarioId})`;
    await auditar({ usuarioId: ctx.usuarioId, accion: 'horas.corregir', recurso: 'tarea_intervalo', recursoId: id, ip: ctx.ip, metadata: { horaFin, motivo } }, tx);
    return { id };
  });
}

type Manual = { tareaId: string; personaId: string; horaInicio: string; horaFin: string; motivo: string; claveIdempotencia: string };

/** Trabajó sin celular: tramo cerrado cargado a mano sobre una tarea de esa persona, sin pisar otros tramos suyos. */
export async function cargarManual(ctx: Ctx, d: Manual) {
  return enTx(async (tx) => {
    const [previo] = await tx<{ id: string }[]>`SELECT id FROM tarea_intervalo WHERE clave_idempotencia = ${d.claveIdempotencia}`;
    if (previo) return { id: previo.id, repetido: true };
    if (ms(d.horaFin) <= ms(d.horaInicio)) throw new ErrorApp(400, 'La hora de fin tiene que ser posterior al inicio');
    if (ms(d.horaFin) - ms(d.horaInicio) > HORAS_MAX_TRAMO * 3_600_000) throw new ErrorApp(400, `Un tramo no puede pasar de ${HORAS_MAX_TRAMO} horas`);
    exigirVentana(d.horaInicio, d.horaFin);
    const [t] = await tx<{ persona_asignada_id: string | null; estado: string }[]>`SELECT persona_asignada_id, estado FROM tarea WHERE id = ${d.tareaId}`;
    if (!t) throw new ErrorApp(404, 'Tarea no encontrada');
    if (t.persona_asignada_id !== d.personaId) throw new ErrorApp(400, 'Esa tarea no está asignada a esa persona');
    if (t.estado === 'CANCELADA') throw new ErrorApp(400, 'La tarea está cancelada');
    await exigirOTsAbiertas(tx, d.tareaId, null);
    // Un candado por persona: dos cargas a la vez no pueden pisarse entre sí.
    await tx`SELECT pg_advisory_xact_lock(hashtext(${'horas:' + d.personaId}))`;
    const [pisa] = await tx`
      SELECT 1 FROM v_tramo WHERE persona_id = ${d.personaId}
        AND tstzrange(hora_inicio, coalesce(hora_fin, clock_timestamp())) && tstzrange(${d.horaInicio}::timestamptz, ${d.horaFin}::timestamptz)`;
    if (pisa) throw new ErrorApp(409, 'Ese horario pisa otro tramo de la misma persona');
    const [n] = await tx<{ id: string }[]>`
      INSERT INTO tarea_intervalo (tarea_id, persona_id, hora_inicio, hora_fin, motivo_cierre, clave_idempotencia, origen, cargado_por, motivo_manual)
      VALUES (${d.tareaId}, ${d.personaId}, ${d.horaInicio}, ${d.horaFin}, 'FIN', ${d.claveIdempotencia}, 'MANUAL', ${ctx.usuarioId}, ${d.motivo})
      RETURNING id`;
    await auditar({ usuarioId: ctx.usuarioId, accion: 'horas.manual', recurso: 'tarea_intervalo', recursoId: n.id, ip: ctx.ip, metadata: { ...d } }, tx);
    return { id: n.id, repetido: false };
  });
}

/** Horas de una persona entre dos fechas (Asunción), 25 por página, con lo corregido y lo cargado a mano. */
export async function horasDePersona(personaId: string, desde: string, hasta: string, pagina: number) {
  const dia = sql`(i.hora_inicio AT TIME ZONE 'America/Asuncion')::date`;
  const items = await sql`
    SELECT i.id, i.hora_inicio, i.hora_fin, i.hora_fin_original, (i.hora_fin IS NULL) AS abierto,
           floor(extract(epoch FROM coalesce(i.hora_fin, clock_timestamp()) - i.hora_inicio))::int AS segundos,
           i.origen, i.motivo_manual, uc.username AS cargado_por,
           coalesce(i.motivo_corregido, i.motivo_correccion) AS motivo_correccion,
           coalesce(ucor.username, ucer.username) AS corregido_por,
           t.id AS tarea_id, t.descripcion AS tarea, o.codigo_ot AS ot_codigo, c.nombre AS cliente, (i.tanda_id IS NOT NULL) AS en_tanda
    FROM v_tramo i JOIN tarea t ON t.id = i.tarea_id JOIN orden_trabajo o ON o.id = t.orden_trabajo_id JOIN cliente c ON c.id = o.cliente_id
    LEFT JOIN usuario uc ON uc.id = i.cargado_por LEFT JOIN usuario ucor ON ucor.id = i.corregido_por LEFT JOIN usuario ucer ON ucer.id = i.cerrado_por
    WHERE i.persona_id = ${personaId} AND ${dia} BETWEEN ${desde}::date AND ${hasta}::date
    ORDER BY i.hora_inicio DESC LIMIT 25 OFFSET ${(pagina - 1) * 25}`;
  const [{ total, segundos }] = await sql<{ total: number; segundos: number }[]>`
    SELECT count(*)::int AS total, coalesce(floor(sum(extract(epoch FROM coalesce(i.hora_fin, clock_timestamp()) - i.hora_inicio))), 0)::int AS segundos
    FROM v_tramo i WHERE i.persona_id = ${personaId} AND ${dia} BETWEEN ${desde}::date AND ${hasta}::date`;
  return { items: [...items], total, segundos_periodo: segundos, pagina };
}

/** Tareas a las que se le pueden cargar horas a mano: asignadas a la persona, no canceladas, en OTs abiertas. */
export async function tareasParaHoras(personaId: string) {
  return [...(await sql`
    SELECT t.id, t.descripcion, t.estado, o.codigo_ot, c.nombre AS cliente
    FROM tarea t JOIN orden_trabajo o ON o.id = t.orden_trabajo_id JOIN cliente c ON c.id = o.cliente_id
    WHERE t.persona_asignada_id = ${personaId} AND t.estado <> 'CANCELADA' AND o.estado NOT IN ('TERMINADO', 'CANCELADO')
    ORDER BY t.updated_at DESC LIMIT 50`)];
}
