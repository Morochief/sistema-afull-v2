import type { TransactionSql } from 'postgres';
import { evaluarGeocerca } from '@afull/shared';
import { ErrorApp } from '../../lib/errores.js';

type Sede = { id: string; nombre: string; lat: number; lng: number; radio_m: number };
export type Ubicacion = { sedeId: string | null; sede: string | null; distanciaM: number | null; dentro: boolean; motivoRemoto: string | null };

/**
 * Loop 16: dónde se marcó. La geocerca es disuasiva: fuera de toda sede, una marcación EN LÍNEA pide el motivo
 * (400 FUERA_DE_ZONA, el celular lo pregunta y reenvía con la misma clave). Lo guardado sin señal no se rechaza nunca
 * por esto (no puede preguntar): queda fuera de zona como siempre. Sin sedes cargadas no se exige nada.
 */
export async function ubicar(tx: TransactionSql, gps: { lat: number; lng: number }, motivo: string | undefined, sinSenal: boolean): Promise<Ubicacion> {
  const sedes = await tx<Sede[]>`SELECT id, nombre, gps_lat::float8 AS lat, gps_lng::float8 AS lng, radio_m FROM sede WHERE activo = ${true}`;
  const mejor = sedes.map((s) => ({ s, ...evaluarGeocerca(gps, s, s.radio_m) })).sort((a, b) => a.distanciaM - b.distanciaM)[0] ?? null;
  const fuera = !!mejor && !mejor.dentro;
  if (fuera && !motivo && !sinSenal) {
    throw new ErrorApp(400, `Estás fuera de la zona (a ${Math.round(mejor.distanciaM)} m de ${mejor.s.nombre}): contá por qué marcás desde afuera`, 'FUERA_DE_ZONA');
  }
  return {
    sedeId: mejor?.s.id ?? null, sede: mejor?.s.nombre ?? null, distanciaM: mejor?.distanciaM ?? null,
    dentro: mejor?.dentro ?? false, motivoRemoto: fuera && motivo ? motivo : null,
  };
}

export type NuevaMarcacion = {
  personaId: string; tipo: string; gps: { lat: number; lng: number }; precisionM?: number; ip: string | null; dispositivoHash: string;
  clave: string; hora: Date | null; sinSenal: boolean; u: Ubicacion; origen: 'PROPIA' | 'CUADRILLA' | 'REMOTO'; marcadaPor?: string; hojaRutaId?: string;
};

export async function insertarMarcacion(tx: TransactionSql, m: NuevaMarcacion) {
  const [r] = await tx<{ id: string; tipo: string; marcada_at: Date; dentro_geocerca: boolean; distancia_m: number | null }[]>`
    INSERT INTO marcacion_asistencia
      (persona_id, sede_id, tipo, gps_lat, gps_lng, precision_m, distancia_m, dentro_geocerca, ip, dispositivo_hash, clave_idempotencia, marcada_at, sin_senal,
       origen, marcada_por, hoja_ruta_id, motivo_remoto)
    VALUES (${m.personaId}, ${m.u.sedeId}, ${m.tipo}, ${m.gps.lat}, ${m.gps.lng}, ${m.precisionM ?? null}, ${m.u.distanciaM}, ${m.u.dentro},
            ${m.ip}, ${m.dispositivoHash.toLowerCase()}, ${m.clave}, coalesce(${m.hora}::timestamptz, clock_timestamp()), ${m.sinSenal},
            ${m.origen}, ${m.marcadaPor ?? null}, ${m.hojaRutaId ?? null}, ${m.origen === 'PROPIA' ? null : m.u.motivoRemoto})
    RETURNING id, tipo, marcada_at, dentro_geocerca, distancia_m::float8 AS distancia_m`;
  return r;
}
