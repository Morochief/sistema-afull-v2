import { apiFetch, ErrorApi } from './api.js';

const json = (body: unknown) => ({ body: JSON.stringify(body) });

export type Vehiculo = { id: string; chapa: string; marca_modelo: string; costo_km_gs?: number; activo: boolean };
export type Sede = { id: string; nombre: string; gps_lat: number; gps_lng: number; radio_m: number; activo: boolean };
export type HojaRutaFila = {
  id: string; fecha: string; descripcion: string | null; estado: string; vehiculo_id: string | null; chapa: string | null;
  paradas: number; personas: number;
};
export type ParadaHoja = {
  id: string; orden_secuencia: number; tipo: string; motivo_extra: string | null; estado: string; motivo_omision: string | null;
  hora_estimada: string | null; orden_trabajo_id: string; codigo_ot: string; titulo: string; cliente_nombre: string;
  sucursal_nombre: string | null; direccion: string | null; gps_lat: number | null; gps_lng: number | null;
};
export type HojaRutaDetalle = Omit<HojaRutaFila, 'paradas' | 'personas'> & {
  personas: { id: string; persona_id: string; nombre: string; rol: string; activo: boolean }[];
  paradas: (ParadaHoja & { fotos: number })[];
  viajes: ViajeHoja[];
};
export type ViajeHoja = {
  id: string; conductor: string; km_inicio: number; km_fin: number | null; hora_inicio: string; hora_fin: string | null;
  alerta_desvio: boolean; motivo_desvio: string | null; km_estimado: number | null; fotos: number;
};
export type ParadaHoy = {
  id: string; orden: number; tipo: string; estado: string; hora_estimada: string | null; orden_trabajo_id: string; codigo_ot: string; titulo: string;
  cliente: string; sucursal: string | null; direccion: string | null; gps_lat: number | null; gps_lng: number | null;
};
export type MiDiaCampo = {
  fecha: string;
  persona: { id: string; nombre: string };
  hojas: { id: string; fecha: string; descripcion: string | null; estado: string; vehiculo_id: string | null; chapa: string | null; rol: string; paradas: ParadaHoy[] }[];
  viaje_abierto: { id: string; vehiculo_id: string; chapa: string; hoja_ruta_id: string | null; km_inicio: number; hora_inicio: string } | null;
  ultima_marcacion: { tipo: 'ENTRADA' | 'SALIDA'; marcada_at: string; dentro_geocerca: boolean } | null;
};

// Flota
export const listarVehiculos = () => apiFetch<Vehiculo[]>('/api/flota/vehiculos');
export const crearVehiculo = (d: { chapa: string; marcaModelo: string; costoKmGs: number }) =>
  apiFetch<Vehiculo>('/api/flota/vehiculos', { method: 'POST', ...json(d) });
export const editarVehiculo = (id: string, d: { marcaModelo?: string; costoKmGs?: number; activo?: boolean }) =>
  apiFetch<Vehiculo>(`/api/flota/vehiculos/${id}`, { method: 'PATCH', ...json(d) });
export const listarSedes = () => apiFetch<Sede[]>('/api/flota/sedes');
export const crearSede = (d: { nombre: string; gpsLat: number; gpsLng: number; radioM: number }) =>
  apiFetch<Sede>('/api/flota/sedes', { method: 'POST', ...json(d) });
export const editarSede = (id: string, d: { activo?: boolean; radioM?: number }) =>
  apiFetch<Sede>(`/api/flota/sedes/${id}`, { method: 'PATCH', ...json(d) });

// Coordinación
export const listarHojasRuta = (desde?: string, hasta?: string) => {
  const p = new URLSearchParams();
  if (desde) p.set('desde', desde);
  if (hasta) p.set('hasta', hasta);
  const q = p.toString();
  return apiFetch<HojaRutaFila[]>(`/api/hojas-ruta${q ? `?${q}` : ''}`);
};
export const obtenerHojaRuta = (id: string) => apiFetch<HojaRutaDetalle>(`/api/hojas-ruta/${id}`);
export const crearHojaRuta = (d: { fecha: string; descripcion?: string; vehiculoId?: string }) =>
  apiFetch<{ id: string }>('/api/hojas-ruta', { method: 'POST', ...json(d) });
export const agregarPersonaHoja = (id: string, d: { personaId: string; rol: string }) =>
  apiFetch<{ id: string }>(`/api/hojas-ruta/${id}/personas`, { method: 'POST', ...json(d) });
export const agregarParadaHoja = (id: string, d: { ordenTrabajoId: string; horaEstimada?: string; motivoExtra?: string }) =>
  apiFetch<{ id: string }>(`/api/hojas-ruta/${id}/paradas`, { method: 'POST', ...json(d) });

// Cuadrilla
export const miDiaCampo = () => apiFetch<MiDiaCampo>('/api/campo/hoy');

const CLAVE_DIA = 'afull_campo_hoy';
/**
 * "Hoy en la calle" con respaldo: si no hay señal se muestra lo último que se bajó (y se avisa).
 * Los errores del servidor (403, etc.) no se tapan con el respaldo.
 */
export async function miDiaCampoConRespaldo(): Promise<MiDiaCampo & { sin_conexion?: string }> {
  try {
    const d = await miDiaCampo();
    try { localStorage.setItem(CLAVE_DIA, JSON.stringify({ d, at: new Date().toISOString() })); } catch { /* sin almacenamiento */ }
    return d;
  } catch (e) {
    if (!(e instanceof ErrorApi && e.status === 0)) throw e;
    let guardado: { d: MiDiaCampo; at: string } | null = null;
    try { guardado = JSON.parse(localStorage.getItem(CLAVE_DIA) ?? 'null'); } catch { /* corrupto */ }
    if (!guardado) throw e;
    return { ...guardado.d, sin_conexion: guardado.at };
  }
}
export const iniciarViaje = (d: { vehiculoId: string; hojaRutaId?: string; kmInicio: number; motivoKmInicio?: string; gpsLat?: number; gpsLng?: number; claveIdempotencia: string }) =>
  apiFetch<{ id: string }>('/api/campo/viajes/iniciar', { method: 'POST', ...json(d) });
export const cerrarViaje = (id: string, d: { kmFin: number; motivoDesvio?: string; gpsLat?: number; gpsLng?: number; claveIdempotencia: string }) =>
  apiFetch<{ id: string; recorrido_km: number; estimado_km: number | null; alerta_desvio: boolean }>(`/api/campo/viajes/${id}/cerrar`, { method: 'POST', ...json(d) });
export const completarParada = (id: string) => apiFetch<{ hoja_finalizada?: boolean }>(`/api/campo/paradas/${id}/completar`, { method: 'POST' });
export const omitirParada = (id: string, motivo: string) =>
  apiFetch<{ hoja_finalizada?: boolean }>(`/api/campo/paradas/${id}/omitir`, { method: 'POST', ...json({ motivo }) });
export const marcarAsistencia = (d: { tipo: 'ENTRADA' | 'SALIDA'; gpsLat: number; gpsLng: number; precisionM?: number; dispositivoHash: string; claveIdempotencia: string }) =>
  apiFetch<{ dentro_geocerca: boolean; distancia_m: number | null; sede: string | null }>('/api/asistencia/marcar', { method: 'POST', ...json(d) });

export type ResultadoProyectoHoja = { agregadas: { id: string; codigo_ot: string }[]; salteadas: { codigo_ot: string; motivo: 'cerrada' | 'ya_esta' }[] };
/** Todas las OTs abiertas de un proyecto como paradas (L4.E5). */
export const agregarProyectoHoja = (id: string, d: { proyectoId: string; motivoExtra?: string }) =>
  apiFetch<ResultadoProyectoHoja>(`/api/hojas-ruta/${id}/paradas-proyecto`, { method: 'POST', ...json(d) });
