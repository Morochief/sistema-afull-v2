import type { TransactionSql } from 'postgres';
import { sql } from '../../db/client.js';
import { esEstadoFinal, type EstadoOT, type OrigenDiseno } from '@afull/shared';
import { auditar } from '../auditoria/service.js';
import { publicarLive } from '../live/publicar.js';
import { ErrorApp, traducirErrorPg } from '../../lib/errores.js';
import type { Ctx } from '../clientes/service.js';

type CtxCaps = Ctx & { capacidades: string[] };
const puede = (c: CtxCaps, cap: string) => c.capacidades.includes('admin') || c.capacidades.includes(cap);

const COLUMNAS = sql`
  d.id, d.orden_trabajo_id, d.version, d.origen, d.drive_url, d.notas, us.username AS subido_por_nombre, d.subido_at,
  d.estado, ur.username AS revisado_por_nombre, d.revisado_at, d.observacion,
  d.autoverificada, d.motivo_cambio, d.motivo_anulacion, d.anulada_at, uo.username AS observado_por_nombre, d.observado_at`;
const DESDE = sql`
  FROM diseno_version d JOIN usuario us ON us.id = d.subido_por LEFT JOIN usuario ur ON ur.id = d.revisado_por
  LEFT JOIN usuario uo ON uo.id = d.observado_por`;
const CON_OT = sql`, o.codigo_ot, o.titulo AS ot_titulo, o.estado AS ot_estado, c.nombre AS cliente_nombre, s.nombre AS sucursal_nombre`;
const JOIN_OT = sql`JOIN orden_trabajo o ON o.id = d.orden_trabajo_id JOIN cliente c ON c.id = o.cliente_id
  LEFT JOIN sucursal s ON s.id = o.sucursal_id`;

async function enTx<T>(fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
  try {
    return (await sql.begin(fn)) as T;
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    if ((e as { constraint_name?: string }).constraint_name === 'uq_diseno_pendiente') {
      throw new ErrorApp(409, 'Ya hay una versión de otra persona esperando revisión: tiene que aprobarse u observarse primero');
    }
    traducirErrorPg(e);
  }
}

export async function versionesDeOT(otId: string) {
  return [...(await sql`SELECT ${COLUMNAS} ${DESDE} WHERE d.orden_trabajo_id = ${otId} ORDER BY d.version DESC`)];
}

/** La diseñadora (sin Comercial) solo opera OTs donde tiene una tarea de diseño. */
async function exigirTareaDiseno(tx: TransactionSql, ctx: CtxCaps, otId: string) {
  const [t] = await tx`
    SELECT 1 FROM tarea t JOIN usuario u ON u.persona_id = t.persona_asignada_id
    WHERE t.orden_trabajo_id = ${otId} AND t.tipo = 'DISENO' AND u.id = ${ctx.usuarioId} AND t.estado <> 'CANCELADA'
  `;
  if (!t) throw new ErrorApp(403, 'No tenés una tarea de diseño asignada en esta OT');
}

type Subida = { origen: OrigenDiseno; driveUrl: string; notas?: string; verificada?: boolean; motivoCambio?: string };

/**
 * Subir una versión (enlace de Drive). Comercial puede cargar el diseño del cliente o el de la diseñadora;
 * quien solo tiene `diseno` (Nachi) sube como DISENADORA y únicamente en OTs donde tiene una tarea de diseño.
 * Loop 19: si la diseñadora tiene una versión SUYA pendiente, esa queda ANULADA (reemplazada) en la misma transacción;
 * con `verificada`, la nueva queda aprobada en el acto (autoverificada si la sube la diseñadora).
 */
export async function subirVersion(ctx: CtxCaps, otId: string, d: Subida) {
  const r = await enTx<{ id: string; version: number }>(async (tx) => {
    const [ot] = await tx`SELECT estado FROM orden_trabajo WHERE id = ${otId} FOR UPDATE`;
    if (!ot) throw new ErrorApp(404, 'OT no encontrada');
    if (esEstadoFinal(ot.estado as EstadoOT)) throw new ErrorApp(409, `La OT está ${ot.estado}`);
    const oficina = puede(ctx, 'comercial');
    if (!oficina) {
      if (d.origen !== 'DISENADORA') throw new ErrorApp(403, 'Solo Comercial carga el diseño que trae el cliente');
      await exigirTareaDiseno(tx, ctx, otId);
    }
    const [{ sig }] = await tx`SELECT coalesce(max(version), 0) + 1 AS sig FROM diseno_version WHERE orden_trabajo_id = ${otId}`;
    const motivo = d.motivoCambio?.trim() || null;
    // Solo la diseñadora reemplaza su propia pendiente; la oficina sigue con el 409 de siempre (la revisa primero).
    const [propia] = oficina ? [] : await tx`SELECT id FROM diseno_version WHERE orden_trabajo_id = ${otId} AND estado = 'PENDIENTE' AND subido_por = ${ctx.usuarioId}`;
    if (propia) {
      await tx`UPDATE diseno_version SET estado = 'ANULADA', anulada_por = ${ctx.usuarioId}, anulada_at = clock_timestamp(),
                 motivo_anulacion = ${motivo ?? `Reemplazada por la v${sig}`} WHERE id = ${propia.id}`;
    }
    const [v] = await tx`
      INSERT INTO diseno_version (orden_trabajo_id, version, origen, drive_url, notas, subido_por, motivo_cambio)
      VALUES (${otId}, ${sig}, ${d.origen}, ${d.driveUrl}, ${d.notas ?? null}, ${ctx.usuarioId}, ${motivo})
      RETURNING id, version
    `;
    if (d.verificada) {
      await tx`UPDATE diseno_version SET estado = 'APROBADO', revisado_por = ${ctx.usuarioId}, revisado_at = clock_timestamp(),
                 autoverificada = ${!oficina} WHERE id = ${v.id}`;
    }
    await auditar({ usuarioId: ctx.usuarioId, accion: 'diseno.subir', recurso: 'diseno_version', recursoId: v.id, ip: ctx.ip,
      metadata: { otId, version: v.version, origen: d.origen, verificada: !!d.verificada, anulada: propia?.id ?? null } }, tx);
    return v as { id: string; version: number };
  });
  await publicarLive('diseno', r.id);
  return r;
}

/** Loop 19: la diseñadora verifica su propia versión pendiente (autoverificada); Comercial la aprueba como siempre. */
export async function verificarVersion(ctx: CtxCaps, id: string) {
  const r = await enTx<{ id: string; estado: string }>(async (tx) => {
    const [v] = await tx`SELECT estado, orden_trabajo_id, subido_por FROM diseno_version WHERE id = ${id} FOR UPDATE`;
    if (!v) throw new ErrorApp(404, 'Versión de diseño no encontrada');
    const oficina = puede(ctx, 'comercial');
    if (!oficina) {
      if (v.subido_por !== ctx.usuarioId) throw new ErrorApp(403, 'Solo podés verificar las versiones que subiste vos');
      await exigirTareaDiseno(tx, ctx, v.orden_trabajo_id);
    }
    if (v.estado !== 'PENDIENTE') throw new ErrorApp(409, 'Esta versión ya no está por verificar');
    await tx`UPDATE diseno_version SET estado = 'APROBADO', revisado_por = ${ctx.usuarioId}, revisado_at = clock_timestamp(),
               autoverificada = ${!oficina} WHERE id = ${id}`;
    await auditar({ usuarioId: ctx.usuarioId, accion: 'diseno.verificar', recurso: 'diseno_version', recursoId: id, ip: ctx.ip, metadata: { otId: v.orden_trabajo_id, autoverificada: !oficina } }, tx);
    return { id, estado: 'APROBADO' };
  });
  await publicarLive('diseno', id);
  return r;
}

/**
 * Revisión de la oficina (Juan, Gerardo o Sofi): una pendiente se aprueba u observa una sola vez.
 * Loop 19: una versión aprobada POR LA DISEÑADORA todavía se puede observar (una vez); una aprobada por la oficina no.
 */
export async function revisarVersion(ctx: Ctx, id: string, aprobar: boolean, observacion?: string) {
  const r = await enTx<{ id: string; estado: string }>(async (tx) => {
    const [v] = await tx`SELECT estado, autoverificada, orden_trabajo_id FROM diseno_version WHERE id = ${id} FOR UPDATE`;
    if (!v) throw new ErrorApp(404, 'Versión de diseño no encontrada');
    if (!aprobar && v.estado === 'APROBADO' && v.autoverificada) {
      await tx`UPDATE diseno_version SET estado = 'OBSERVADO', observacion = ${observacion!.trim()},
                 observado_por = ${ctx.usuarioId}, observado_at = clock_timestamp() WHERE id = ${id}`;
    } else {
      if (v.estado !== 'PENDIENTE') {
        const hecho = { APROBADO: 'aprobada por la oficina', OBSERVADO: 'observada', ANULADA: 'anulada' }[v.estado as string] ?? v.estado;
        throw new ErrorApp(409, `Esta versión ya fue ${hecho}`);
      }
      const estado = aprobar ? 'APROBADO' : 'OBSERVADO';
      await tx`
        UPDATE diseno_version SET estado = ${estado}, revisado_por = ${ctx.usuarioId}, revisado_at = clock_timestamp(),
               observacion = ${aprobar ? null : observacion!.trim()}
        WHERE id = ${id}
      `;
    }
    await auditar({ usuarioId: ctx.usuarioId, accion: aprobar ? 'diseno.aprobar' : 'diseno.observar', recurso: 'diseno_version', recursoId: id, ip: ctx.ip, metadata: { otId: v.orden_trabajo_id } }, tx);
    return { id, estado: aprobar ? 'APROBADO' : 'OBSERVADO' };
  });
  await publicarLive('diseno', id);
  return r;
}

/** Por revisar: versiones PENDIENTES (Juan y Sofi). */
export async function pendientesDeRevision() {
  return [...(await sql`SELECT ${COLUMNAS} ${CON_OT} ${DESDE} ${JOIN_OT} WHERE d.estado = 'PENDIENTE' ORDER BY d.subido_at`)];
}

/**
 * Cola de producción de Edu: OTs abiertas cuya ÚLTIMA versión está aprobada.
 * Si después de aprobar se sube otra versión, la OT sale de la cola hasta que esa también se apruebe.
 */
export async function colaDeProduccion() {
  return [
    ...(await sql`
      SELECT ${COLUMNAS} ${CON_OT} ${DESDE} ${JOIN_OT}
      WHERE d.estado = 'APROBADO'
        AND d.version = (SELECT max(version) FROM diseno_version x WHERE x.orden_trabajo_id = d.orden_trabajo_id)
        AND o.estado NOT IN ('TERMINADO', 'CANCELADO')
      ORDER BY d.revisado_at
    `),
  ];
}
