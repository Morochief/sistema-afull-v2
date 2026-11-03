import { sql } from '../../db/client.js';
import { auditar } from '../auditoria/service.js';
import { ErrorApp } from '../../lib/errores.js';
import type { Ctx } from '../clientes/service.js';
import { personaDeSesion, enTx, hoyAsuncion, horaDeAccion } from './comun.js';

/** Completar u omitir una parada de una hoja en la que la persona está. Repetir la misma acción no falla. */
export function cerrarParada(ctx: Ctx, paradaId: string, accion: 'COMPLETADA' | 'OMITIDA', motivo?: string, ocurridaAt?: string) {
  return enTx(async (tx) => {
    const persona = await personaDeSesion(tx, ctx.usuarioId);
    const [p] = await tx`
      SELECT pa.estado, pa.hoja_ruta_id, h.estado AS hoja_estado, q.activo AS en_cuadrilla
      FROM hoja_ruta_parada pa
      JOIN hoja_ruta h ON h.id = pa.hoja_ruta_id
      LEFT JOIN hoja_ruta_persona q ON q.hoja_ruta_id = h.id AND q.persona_id = ${persona.id}
      WHERE pa.id = ${paradaId} FOR UPDATE OF pa
    `;
    if (!p) throw new ErrorApp(404, 'Parada no encontrada');
    if (!p.en_cuadrilla) throw new ErrorApp(403, 'No estás en la cuadrilla de esta hoja de ruta');
    if (p.estado === accion) return { id: paradaId, estado: accion, repetida: true };
    if (p.estado !== 'PENDIENTE') throw new ErrorApp(409, `La parada ya está ${p.estado}`);
    if (p.hoja_estado === 'FINALIZADA') throw new ErrorApp(409, 'La hoja de ruta está finalizada');
    if (accion === 'OMITIDA' && !motivo?.trim()) throw new ErrorApp(400, 'Omitir una parada requiere motivo');
    const h = await horaDeAccion(tx, ocurridaAt);
    await tx`
      UPDATE hoja_ruta_parada SET estado = ${accion}, motivo_omision = ${accion === 'OMITIDA' ? motivo!.trim() : null}, cierre_sin_senal = ${h.sinSenal},
             completada_at = ${accion === 'COMPLETADA' ? sql`coalesce(${h.hora}::timestamptz, clock_timestamp())` : null}
      WHERE id = ${paradaId}
    `;
    // Si ya no quedan paradas pendientes, la hoja se finaliza sola.
    const [{ pendientes }] = await tx`
      SELECT count(*)::int AS pendientes FROM hoja_ruta_parada WHERE hoja_ruta_id = ${p.hoja_ruta_id} AND estado = 'PENDIENTE'
    `;
    if (pendientes === 0) await tx`UPDATE hoja_ruta SET estado = 'FINALIZADA' WHERE id = ${p.hoja_ruta_id}`;
    await auditar(
      { usuarioId: ctx.usuarioId, accion: accion === 'COMPLETADA' ? 'parada.completar' : 'parada.omitir', recurso: 'hoja_ruta_parada', recursoId: paradaId, ip: ctx.ip, metadata: { motivo: motivo ?? null } },
      tx
    );
    return { id: paradaId, estado: accion, repetida: false, hoja_finalizada: pendientes === 0 };
  });
}

/** "Hoy en la calle": hojas de hoy de la persona, con paradas; viaje abierto y última marcación. */
export async function miDiaEnCampo(ctx: Ctx) {
  const [u] = await sql`
    SELECT p.id, p.nombre FROM usuario u JOIN persona p ON p.id = u.persona_id WHERE u.id = ${ctx.usuarioId} AND p.activo
  `;
  if (!u) throw new ErrorApp(403, 'Tu usuario no está vinculado a una persona activa');
  const fecha = hoyAsuncion();
  const hojas = await sql`
    SELECT h.id, h.fecha::text AS fecha, h.descripcion, h.estado, h.vehiculo_id, v.chapa, q.rol,
      coalesce((
        SELECT json_agg(json_build_object(
          'id', pa.id, 'orden', pa.orden_secuencia, 'tipo', pa.tipo, 'estado', pa.estado,
          'hora_estimada', pa.hora_estimada::text, 'orden_trabajo_id', o.id, 'codigo_ot', o.codigo_ot, 'titulo', o.titulo,
          'cliente', c.nombre, 'sucursal', s.nombre, 'direccion', s.direccion,
          'gps_lat', s.gps_lat::float8, 'gps_lng', s.gps_lng::float8
        ) ORDER BY pa.orden_secuencia)
        FROM hoja_ruta_parada pa JOIN orden_trabajo o ON o.id = pa.orden_trabajo_id JOIN cliente c ON c.id = o.cliente_id
        LEFT JOIN sucursal s ON s.id = o.sucursal_id WHERE pa.hoja_ruta_id = h.id
      ), '[]') AS paradas
    FROM hoja_ruta h JOIN hoja_ruta_persona q ON q.hoja_ruta_id = h.id AND q.persona_id = ${u.id} AND q.activo
    LEFT JOIN vehiculo v ON v.id = h.vehiculo_id
    WHERE h.fecha = ${fecha}::date ORDER BY h.created_at
  `;
  const [viaje] = await sql`
    SELECT vi.id, vi.vehiculo_id, ve.chapa, vi.hoja_ruta_id, vi.km_inicio::float8 AS km_inicio, vi.hora_inicio
    FROM viaje vi JOIN vehiculo ve ON ve.id = vi.vehiculo_id WHERE vi.conductor_persona_id = ${u.id} AND vi.km_fin IS NULL
  `;
  const [marcacion] = await sql`
    SELECT tipo, marcada_at, dentro_geocerca FROM marcacion_asistencia WHERE persona_id = ${u.id} ORDER BY marcada_at DESC LIMIT 1
  `;
  return { fecha, persona: u, hojas: [...hojas], viaje_abierto: viaje ?? null, ultima_marcacion: marcacion ?? null };
}
