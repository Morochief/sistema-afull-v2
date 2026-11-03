import type { EstadoPermiso, Pagina, TipoPermiso } from '@afull/shared';
import { apiFetch } from './api.js';
import { queryListado, type FiltrosListado } from './api-presupuestos.js';

export type SolicitudPermiso = {
  id: string; numero: string; persona_id: string; persona_nombre: string; tipo: TipoPermiso; detalle_tipo: string | null; motivo: string;
  modalidad: 'HORAS' | 'DIAS'; fecha_desde: string; fecha_hasta: string; hora_desde: string | null; hora_hasta: string | null;
  comprobante_url: string | null; fuera_de_plazo: boolean; estado: EstadoPermiso; con_descuento: boolean | null; created_at: string;
};
export type EventoPermiso = { id: string; estado_anterior: EstadoPermiso | null; estado_nuevo: EstadoPermiso; con_descuento: boolean | null; comentario: string | null; created_at: string; autor: string };
export type SolicitudDetalle = SolicitudPermiso & { es_propia: boolean; eventos: EventoPermiso[] };
export type NuevaSolicitud = {
  personaId?: string; tipo: TipoPermiso; detalleTipo?: string; motivo: string; modalidad: 'HORAS' | 'DIAS';
  fechaDesde: string; fechaHasta?: string; horaDesde?: string; horaHasta?: string; comprobanteUrl?: string; claveIdempotencia: string;
};
export type Marcacion = {
  id: string; persona_nombre: string; tipo: string; marcada_at: string; dentro_geocerca: boolean;
  distancia_m: number | null; precision_m: number | null; sede_nombre: string | null; sin_senal?: boolean; recibida_at?: string;
};

const json = (body: unknown) => ({ body: JSON.stringify(body) });

export const listarPermisos = (f: FiltrosListado) => apiFetch<Pagina<SolicitudPermiso>>(`/api/permisos${queryListado(f)}`);
export const obtenerPermiso = (id: string) => apiFetch<SolicitudDetalle>(`/api/permisos/${id}`);
export const crearPermiso = (d: NuevaSolicitud) => apiFetch<{ id: string; numero: string; fuera_de_plazo?: boolean }>('/api/permisos', { method: 'POST', ...json(d) });
export const transicionarPermiso = (id: string, d: { desde: EstadoPermiso; a: EstadoPermiso; comentario?: string; conDescuento?: boolean }) =>
  apiFetch<{ id: string; estado: EstadoPermiso }>(`/api/permisos/${id}/transicionar`, { method: 'POST', ...json(d) });

/** Asistencia (RR.HH.): el "estado" de la tabla es "todas" o "fuera de la geocerca". */
export const listarAsistencia = (f: FiltrosListado) => {
  const q = queryListado({ ...f, estado: undefined });
  const fuera = f.estado === 'FUERA' ? `${q ? '&' : '?'}soloFuera=true` : '';
  return apiFetch<Pagina<Marcacion>>(`/api/asistencia${q}${fuera}`);
};
