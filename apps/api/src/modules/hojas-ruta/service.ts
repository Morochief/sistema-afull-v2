import type { TransactionSql } from 'postgres';
import { sql } from '../../db/client.js';
import { esEstadoFinal, type EstadoOT } from '@afull/shared';
import { auditar } from '../auditoria/service.js';
import { ErrorApp, traducirErrorPg } from '../../lib/errores.js';
import type { Ctx } from '../clientes/service.js';

export async function enTx<T>(fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
  try {
    return (await sql.begin(fn)) as T;
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}

export async function listarHojasRuta(desde?: string, hasta?: string) {
  return [
    ...(await sql`
      SELECT h.id, h.fecha::text AS fecha, h.descripcion, h.estado, h.vehiculo_id, v.chapa,
             (SELECT count(*)::int FROM hoja_ruta_parada p WHERE p.hoja_ruta_id = h.id) AS paradas,
             (SELECT count(*)::int FROM hoja_ruta_persona q WHERE q.hoja_ruta_id = h.id AND q.activo) AS personas
      FROM hoja_ruta h LEFT JOIN vehiculo v ON v.id = h.vehiculo_id
      WHERE h.fecha >= coalesce(${desde ?? null}::date, current_date - 7)
        AND h.fecha <= coalesce(${hasta ?? null}::date, current_date + 30)
      ORDER BY h.fecha DESC, h.created_at DESC LIMIT 200
    `),
  ];
}

export async function obtenerHojaRuta(id: string) {
  const [h] = await sql`
    SELECT h.id, h.fecha::text AS fecha, h.descripcion, h.estado, h.vehiculo_id, v.chapa, h.created_at, h.updated_at
    FROM hoja_ruta h LEFT JOIN vehiculo v ON v.id = h.vehiculo_id WHERE h.id = ${id}
  `;
  if (!h) throw new ErrorApp(404, 'Hoja de ruta no encontrada');
  const personas = await sql`
    SELECT q.id, q.persona_id, p.nombre, q.rol, q.activo
    FROM hoja_ruta_persona q JOIN persona p ON p.id = q.persona_id WHERE q.hoja_ruta_id = ${id} ORDER BY q.created_at
  `;
  const paradas = await sql`
    SELECT pa.id, pa.orden_secuencia, pa.tipo, pa.motivo_extra, pa.estado, pa.motivo_omision, pa.hora_estimada::text AS hora_estimada,
           pa.completada_at, o.id AS orden_trabajo_id, o.codigo_ot, o.titulo, c.nombre AS cliente_nombre,
           s.nombre AS sucursal_nombre, s.direccion, s.gps_lat::float8 AS gps_lat, s.gps_lng::float8 AS gps_lng,
           (SELECT count(*)::int FROM archivo ar WHERE ar.parada_id = pa.id AND ar.estado = 'SUBIDO') AS fotos
    FROM hoja_ruta_parada pa
    JOIN orden_trabajo o ON o.id = pa.orden_trabajo_id
    JOIN cliente c ON c.id = o.cliente_id
    LEFT JOIN sucursal s ON s.id = o.sucursal_id
    WHERE pa.hoja_ruta_id = ${id} ORDER BY pa.orden_secuencia
  `;
  // Viajes de la hoja con sus fotos de odómetro (L4.E3): Comercial controla los km contra la foto.
  const viajes = await sql`
    SELECT vi.id, p.nombre AS conductor, vi.km_inicio::float8 AS km_inicio, vi.km_fin::float8 AS km_fin, vi.hora_inicio, vi.hora_fin,
           vi.alerta_desvio, vi.motivo_desvio, vi.km_estimado_ruta::float8 AS km_estimado,
           (SELECT count(*)::int FROM archivo ar WHERE ar.viaje_id = vi.id AND ar.estado = 'SUBIDO') AS fotos
    FROM viaje vi JOIN persona p ON p.id = vi.conductor_persona_id
    WHERE vi.hoja_ruta_id = ${id} ORDER BY vi.hora_inicio
  `;
  return { ...h, personas: [...personas], paradas: [...paradas], viajes: [...viajes] };
}

export function crearHojaRuta(ctx: Ctx, d: { fecha: string; descripcion?: string; vehiculoId?: string }) {
  return enTx<{ id: string }>(async (tx) => {
    if (d.vehiculoId) {
      const [v] = await tx`SELECT activo FROM vehiculo WHERE id = ${d.vehiculoId}`;
      if (!v?.activo) throw new ErrorApp(400, 'Vehículo inexistente o inactivo');
    }
    const [h] = await tx`
      INSERT INTO hoja_ruta (fecha, descripcion, vehiculo_id, creado_por)
      VALUES (${d.fecha}, ${d.descripcion ?? null}, ${d.vehiculoId ?? null}, ${ctx.usuarioId}) RETURNING id
    `;
    await auditar({ usuarioId: ctx.usuarioId, accion: 'hoja_ruta.crear', recurso: 'hoja_ruta', recursoId: h.id, ip: ctx.ip, metadata: { fecha: d.fecha } }, tx);
    return h as { id: string };
  });
}

export async function hojaEditable(tx: TransactionSql, id: string) {
  const [h] = await tx`SELECT estado FROM hoja_ruta WHERE id = ${id} FOR UPDATE`;
  if (!h) throw new ErrorApp(404, 'Hoja de ruta no encontrada');
  if (h.estado === 'FINALIZADA') throw new ErrorApp(409, 'La hoja de ruta está finalizada');
  return h as { estado: string };
}

export function agregarPersona(ctx: Ctx, hojaId: string, d: { personaId: string; rol: string }) {
  return enTx<{ id: string }>(async (tx) => {
    await hojaEditable(tx, hojaId);
    const [p] = await tx`SELECT activo FROM persona WHERE id = ${d.personaId}`;
    if (!p?.activo) throw new ErrorApp(400, 'Persona inexistente o inactiva');
    const [r] = await tx`
      INSERT INTO hoja_ruta_persona (hoja_ruta_id, persona_id, rol) VALUES (${hojaId}, ${d.personaId}, ${d.rol})
      ON CONFLICT (hoja_ruta_id, persona_id) DO UPDATE SET rol = EXCLUDED.rol, activo = true
      RETURNING id
    `;
    await auditar({ usuarioId: ctx.usuarioId, accion: 'hoja_ruta.persona', recurso: 'hoja_ruta', recursoId: hojaId, ip: ctx.ip, metadata: d }, tx);
    return r as { id: string };
  });
}

/** Parada = una OT no final; con la hoja ya EN_CURSO, la parada es EXTRA y exige motivo. */
export function agregarParada(ctx: Ctx, hojaId: string, d: { ordenTrabajoId: string; horaEstimada?: string; motivoExtra?: string }) {
  return enTx<{ id: string }>(async (tx) => {
    const h = await hojaEditable(tx, hojaId);
    const [ot] = await tx`SELECT estado FROM orden_trabajo WHERE id = ${d.ordenTrabajoId}`;
    if (!ot) throw new ErrorApp(400, 'OT inexistente');
    if (esEstadoFinal(ot.estado as EstadoOT)) throw new ErrorApp(400, `La OT está ${ot.estado}`);
    const extra = h.estado === 'EN_CURSO';
    if (extra && !d.motivoExtra?.trim()) throw new ErrorApp(400, 'La hoja ya salió: una parada nueva es EXTRA y requiere motivo');
    const [{ sig }] = await tx`SELECT coalesce(max(orden_secuencia), 0) + 1 AS sig FROM hoja_ruta_parada WHERE hoja_ruta_id = ${hojaId}`;
    const [r] = await tx`
      INSERT INTO hoja_ruta_parada (hoja_ruta_id, orden_trabajo_id, orden_secuencia, tipo, motivo_extra, hora_estimada)
      VALUES (${hojaId}, ${d.ordenTrabajoId}, ${sig}, ${extra ? 'EXTRA' : 'PLANIFICADA'}, ${extra ? d.motivoExtra! : null}, ${d.horaEstimada ?? null})
      RETURNING id
    `;
    await auditar({ usuarioId: ctx.usuarioId, accion: 'hoja_ruta.parada', recurso: 'hoja_ruta', recursoId: hojaId, ip: ctx.ip, metadata: { otId: d.ordenTrabajoId, extra } }, tx);
    return r as { id: string };
  });
}
