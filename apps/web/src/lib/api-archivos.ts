import type { TipoArchivo } from '@afull/shared';
import { apiFetch, ErrorApi } from './api.js';
import { portalFetch } from './api-portal.js';

/** Fotos y archivos (L4.E3): pedir → subir directo a Storage con la URL firmada → confirmar. */
export type ArchivoVista = {
  id: string; tipo: TipoArchivo; mime: string; bytes: number; tomada_at: string; sin_senal: boolean; subido_at: string; subido_por: string; url: string;
};
export type RefArchivo = { viajeId?: string; claveViaje?: string; paradaId?: string; tareaId?: string; solicitudId?: string; pedidoId?: string };

/** Quién llama: con sesión (cookie) o desde el portal (token). Mismo flujo para los dos. */
export type Llamador = <T>(path: string, init?: { method?: string; body?: unknown }) => Promise<T>;
export const llamadorSesion: Llamador = (path, init = {}) =>
  apiFetch(path, { method: init.method ?? 'GET', ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}) });
export const llamadorPortal = (token: string): Llamador => (path, init) => portalFetch(token, path, init);
export const BASE_SESION = '/api/archivos';
export const BASE_PORTAL = '/api/portal/archivos';

type Solicitud = { id: string; estado: 'PENDIENTE' | 'SUBIDO'; subirA?: string; mime?: string };
export type DatosSubida = RefArchivo & { tipo: TipoArchivo; mime: string; blob: Blob; claveIdempotencia: string; tomadaAt?: string };

/**
 * Sube un archivo. Idempotente por `claveIdempotencia`: reintentar después de un corte no duplica.
 * Un corte de red o un error de Storage (5xx) sale como `status 0` (= "sin señal": se reintenta más tarde).
 */
export async function subirArchivo(llamar: Llamador, base: string, d: DatosSubida): Promise<string> {
  const { blob, ...resto } = d;
  const s = await llamar<Solicitud>(`${base}/solicitar`, { method: 'POST', body: { ...resto, bytes: blob.size } });
  if (s.estado === 'SUBIDO') return s.id;
  let r: Response;
  try {
    r = await fetch(s.subirA!, {
      method: 'PUT',
      body: blob,
      credentials: 'omit',
      headers: { 'content-type': d.mime, 'x-upsert': 'true', 'cache-control': 'max-age=3600' },
    });
  } catch {
    throw new ErrorApi(0, 'No se pudo subir: sin conexión');
  }
  if (!r.ok) {
    if (r.status === 413) throw new ErrorApi(400, 'El archivo es demasiado grande');
    throw new ErrorApi(r.status >= 500 || r.status === 408 ? 0 : r.status, 'No se pudo subir el archivo');
  }
  await llamar(`${base}/${s.id}/confirmar`, { method: 'POST' });
  return s.id;
}

export function listarArchivos(llamar: Llamador, base: string, ref: RefArchivo) {
  const q = new URLSearchParams(Object.entries(ref).filter(([, v]) => v) as [string, string][]);
  return llamar<ArchivoVista[]>(`${base}?${q}`);
}

export const usoAlmacenamiento = () => apiFetch<{ bytes: number; archivos: number; limite_bytes: number }>('/api/archivos/uso');
