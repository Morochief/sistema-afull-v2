import type { TransactionSql } from 'postgres';
import { alertaDesvio, distanciaRutaKm, type Punto } from '@afull/shared';
import { auditar } from '../auditoria/service.js';
import { publicarLive } from '../live/publicar.js';
import { ErrorApp } from '../../lib/errores.js';
import type { Ctx } from '../clientes/service.js';
import { personaDeSesion, enTx, horaDeAccion } from './comun.js';

type Iniciar = {
  vehiculoId: string; hojaRutaId?: string; kmInicio: number; motivoKmInicio?: string;
  gpsLat?: number; gpsLng?: number; claveIdempotencia: string; ocurridaAt?: string;
};
type Cerrar = { kmFin: number; motivoDesvio?: string; gpsLat?: number; gpsLng?: number; claveIdempotencia: string; ocurridaAt?: string };

/** Iniciar viaje: idempotente por clave; un viaje abierto por vehículo y por conductor (lo garantiza el motor). */
export async function iniciarViaje(ctx: Ctx, d: Iniciar) {
  const r = await enTx(async (tx) => {
    const persona = await personaDeSesion(tx, ctx.usuarioId);
    const [previo] = await tx`SELECT id FROM viaje WHERE clave_idempotencia = ${d.claveIdempotencia}`;
    if (previo) return { id: previo.id as string, repetido: true };

    const [v] = await tx`SELECT activo FROM vehiculo WHERE id = ${d.vehiculoId} FOR UPDATE`;
    if (!v?.activo) throw new ErrorApp(400, 'Vehículo inexistente o inactivo');
    if (d.hojaRutaId) {
      const [h] = await tx`
        SELECT h.estado, h.vehiculo_id, q.activo AS en_cuadrilla
        FROM hoja_ruta h LEFT JOIN hoja_ruta_persona q ON q.hoja_ruta_id = h.id AND q.persona_id = ${persona.id}
        WHERE h.id = ${d.hojaRutaId} FOR UPDATE OF h
      `;
      if (!h) throw new ErrorApp(400, 'Hoja de ruta inexistente');
      if (!h.en_cuadrilla) throw new ErrorApp(403, 'No estás en la cuadrilla de esa hoja de ruta');
      if (h.estado === 'FINALIZADA') throw new ErrorApp(409, 'La hoja de ruta está finalizada');
      if (h.vehiculo_id && h.vehiculo_id !== d.vehiculoId) throw new ErrorApp(400, 'Ese no es el vehículo asignado a la hoja de ruta');
      if (h.estado === 'PLANIFICADA') await tx`UPDATE hoja_ruta SET estado = 'EN_CURSO' WHERE id = ${d.hojaRutaId}`;
    }
    const [ult] = await tx`
      SELECT km_fin::float8 AS km FROM viaje WHERE vehiculo_id = ${d.vehiculoId} AND km_fin IS NOT NULL
      ORDER BY hora_fin DESC LIMIT 1
    `;
    if (ult && d.kmInicio < ult.km && !d.motivoKmInicio?.trim()) {
      throw new ErrorApp(400, `El último viaje de este vehículo cerró con ${ult.km} km. Revisá el odómetro o indicá el motivo.`);
    }
    const h = await horaDeAccion(tx, d.ocurridaAt);
    const [viaje] = await tx`
      INSERT INTO viaje (vehiculo_id, conductor_persona_id, hoja_ruta_id, km_inicio, motivo_km_inicio, gps_lat_inicio, gps_lng_inicio, clave_idempotencia,
                         hora_inicio, inicio_sin_senal)
      VALUES (${d.vehiculoId}, ${persona.id}, ${d.hojaRutaId ?? null}, ${d.kmInicio}, ${d.motivoKmInicio?.trim() || null},
              ${d.gpsLat ?? null}, ${d.gpsLng ?? null}, ${d.claveIdempotencia}, coalesce(${h.hora}::timestamptz, clock_timestamp()), ${h.sinSenal})
      RETURNING id
    `;
    await auditar({ usuarioId: ctx.usuarioId, accion: 'viaje.iniciar', recurso: 'viaje', recursoId: viaje.id, ip: ctx.ip, metadata: { km: d.kmInicio } }, tx);
    return { id: viaje.id as string, repetido: false };
  });
  if (!r.repetido) await publicarLive('viaje', r.id);
  return r;
}

/** Km estimados: sede → paradas planificadas con GPS (en orden) → sede, por el factor de tortuosidad. */
async function kmEstimado(tx: TransactionSql, hojaRutaId: string | null): Promise<number | null> {
  if (!hojaRutaId) return null;
  const paradas = await tx<Punto[]>`
    SELECT s.gps_lat::float8 AS lat, s.gps_lng::float8 AS lng
    FROM hoja_ruta_parada p JOIN orden_trabajo o ON o.id = p.orden_trabajo_id JOIN sucursal s ON s.id = o.sucursal_id
    WHERE p.hoja_ruta_id = ${hojaRutaId} AND p.tipo = 'PLANIFICADA' ORDER BY p.orden_secuencia
  `;
  if (paradas.length === 0) return null;
  const [sede] = await tx<Punto[]>`SELECT gps_lat::float8 AS lat, gps_lng::float8 AS lng FROM sede WHERE activo ORDER BY created_at LIMIT 1`;
  return distanciaRutaKm(sede ? [sede, ...paradas, sede] : paradas);
}

/** Cerrar viaje: solo el conductor; idempotente; la alerta de desvío es informativa (pide motivo, no bloquea). */
export async function cerrarViaje(ctx: Ctx, viajeId: string, d: Cerrar) {
  return enTx(async (tx) => {
    const persona = await personaDeSesion(tx, ctx.usuarioId);
    const [v] = await tx`
      SELECT id, conductor_persona_id, hoja_ruta_id, km_inicio::float8 AS km_inicio, km_fin, clave_cierre
      FROM viaje WHERE id = ${viajeId} FOR UPDATE
    `;
    if (!v) throw new ErrorApp(404, 'Viaje no encontrado');
    if (v.conductor_persona_id !== persona.id) throw new ErrorApp(403, 'Solo el conductor cierra su viaje');
    if (v.km_fin !== null) {
      if (v.clave_cierre === d.claveIdempotencia) return { id: viajeId, repetido: true };
      throw new ErrorApp(409, 'El viaje ya está cerrado');
    }
    if (d.kmFin < v.km_inicio) throw new ErrorApp(400, `Los km de cierre no pueden ser menores a los de inicio (${v.km_inicio})`);
    const estimado = await kmEstimado(tx, v.hoja_ruta_id);
    const recorrido = Math.round((d.kmFin - v.km_inicio) * 10) / 10;
    const alerta = alertaDesvio(recorrido, estimado);
    if (alerta && !d.motivoDesvio?.trim()) {
      throw new ErrorApp(400, `Recorrido de ${recorrido} km contra ${estimado} km estimados: indicá el motivo (paradas extra, desvío, etc.)`);
    }
    const h = await horaDeAccion(tx, d.ocurridaAt);
    await tx`
      UPDATE viaje SET km_fin = ${d.kmFin}, hora_fin = greatest(coalesce(${h.hora}::timestamptz, clock_timestamp()), hora_inicio), cierre_sin_senal = ${h.sinSenal},
             km_estimado_ruta = ${estimado},
             alerta_desvio = ${alerta}, motivo_desvio = ${d.motivoDesvio?.trim() || null},
             gps_lat_fin = ${d.gpsLat ?? null}, gps_lng_fin = ${d.gpsLng ?? null}, clave_cierre = ${d.claveIdempotencia}
      WHERE id = ${viajeId}
    `;
    await auditar({ usuarioId: ctx.usuarioId, accion: 'viaje.cerrar', recurso: 'viaje', recursoId: viajeId, ip: ctx.ip, metadata: { recorrido, estimado, alerta } }, tx);
    return { id: viajeId, repetido: false, recorrido_km: recorrido, estimado_km: estimado, alerta_desvio: alerta };
  });
}
