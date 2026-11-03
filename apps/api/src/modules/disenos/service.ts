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
  d.estado, ur.username AS revisado_por_nombre, d.revisado_at, d.observacion`;
const DESDE = sql`
  FROM diseno_version d JOIN usuario us ON us.id = d.subido_por LEFT JOIN usuario ur ON ur.id = d.revisado_por`;
const CON_OT = sql`, o.codigo_ot, o.titulo AS ot_titulo, o.estado AS ot_estado, c.nombre AS cliente_nombre, s.nombre AS sucursal_nombre`;
const JOIN_OT = sql`JOIN orden_trabajo o ON o.id = d.orden_trabajo_id JOIN cliente c ON c.id = o.cliente_id
  LEFT JOIN sucursal s ON s.id = o.sucursal_id`;

async function enTx<T>(fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
  try {
    return (await sql.begin(fn)) as T;
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    if ((e as { constraint_name?: string }).constraint_name === 'uq_diseno_pendiente') {
      throw new ErrorApp(409, 'Ya hay una versión esperando revisión: Juan o Sofi tienen que aprobarla u observarla primero');
    }
    traducirErrorPg(e);
  }
}

export async function versionesDeOT(otId: string) {
  return [...(await sql`SELECT ${COLUMNAS} ${DESDE} WHERE d.orden_trabajo_id = ${otId} ORDER BY d.version DESC`)];
}

/**
 * Subir una versión (enlace de Drive). Comercial puede cargar el diseño del cliente o el de la diseñadora;
 * quien solo tiene `diseno` (Nachi) sube como DISENADORA y únicamente en OTs donde tiene una tarea de diseño.
 */
export async function subirVersion(ctx: CtxCaps, otId: string, d: { origen: OrigenDiseno; driveUrl: string; notas?: string }) {
  const r = await enTx<{ id: string; version: number }>(async (tx) => {
    const [ot] = await tx`SELECT estado FROM orden_trabajo WHERE id = ${otId} FOR UPDATE`;
    if (!ot) throw new ErrorApp(404, 'OT no encontrada');
    if (esEstadoFinal(ot.estado as EstadoOT)) throw new ErrorApp(409, `La OT está ${ot.estado}`);
    if (!puede(ctx, 'comercial')) {
      if (d.origen !== 'DISENADORA') throw new ErrorApp(403, 'Solo Comercial carga el diseño que trae el cliente');
      const [t] = await tx`
        SELECT 1 FROM tarea t JOIN usuario u ON u.persona_id = t.persona_asignada_id
        WHERE t.orden_trabajo_id = ${otId} AND t.tipo = 'DISENO' AND u.id = ${ctx.usuarioId} AND t.estado <> 'CANCELADA'
      `;
      if (!t) throw new ErrorApp(403, 'No tenés una tarea de diseño asignada en esta OT');
    }
    const [{ sig }] = await tx`SELECT coalesce(max(version), 0) + 1 AS sig FROM diseno_version WHERE orden_trabajo_id = ${otId}`;
    const [v] = await tx`
      INSERT INTO diseno_version (orden_trabajo_id, version, origen, drive_url, notas, subido_por)
      VALUES (${otId}, ${sig}, ${d.origen}, ${d.driveUrl}, ${d.notas ?? null}, ${ctx.usuarioId})
      RETURNING id, version
    `;
    await auditar({ usuarioId: ctx.usuarioId, accion: 'diseno.subir', recurso: 'diseno_version', recursoId: v.id, ip: ctx.ip, metadata: { otId, version: v.version, origen: d.origen } }, tx);
    return v as { id: string; version: number };
  });
  await publicarLive('diseno', r.id);
  return r;
}

/** Revisión obligatoria (Juan o Sofi): una sola vez por versión; observar exige el motivo. */
export async function revisarVersion(ctx: Ctx, id: string, aprobar: boolean, observacion?: string) {
  const r = await enTx<{ id: string; estado: string }>(async (tx) => {
    const [v] = await tx`SELECT estado, orden_trabajo_id FROM diseno_version WHERE id = ${id} FOR UPDATE`;
    if (!v) throw new ErrorApp(404, 'Versión de diseño no encontrada');
    if (v.estado !== 'PENDIENTE') throw new ErrorApp(409, `Esta versión ya fue ${v.estado === 'APROBADO' ? 'aprobada' : 'observada'}`);
    const estado = aprobar ? 'APROBADO' : 'OBSERVADO';
    await tx`
      UPDATE diseno_version SET estado = ${estado}, revisado_por = ${ctx.usuarioId}, revisado_at = clock_timestamp(),
             observacion = ${aprobar ? null : observacion!.trim()}
      WHERE id = ${id}
    `;
    await auditar({ usuarioId: ctx.usuarioId, accion: aprobar ? 'diseno.aprobar' : 'diseno.observar', recurso: 'diseno_version', recursoId: id, ip: ctx.ip, metadata: { otId: v.orden_trabajo_id } }, tx);
    return { id, estado };
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
