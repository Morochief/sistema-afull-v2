import type { PanelRespuesta } from '@afull/shared';
import { apiFetch } from './api.js';

/** Loop 14: panel de Gerardo (quién está y en qué). */
export const obtenerPanel = () => apiFetch<PanelRespuesta>('/api/panel');

const MOTIVOS: Record<string, string> = {
  PAUSA: 'Pausa', ALMUERZO: 'Almuerzo', FALTA_MATERIAL: 'Falta material', LLUVIA: 'Lluvia', CAMBIO_TAREA: 'Cambio de tarea', OTRO: 'Otro', CORRECCION: 'Cerrado por la oficina',
};
export const motivoPausa = (m: string) => MOTIVOS[m] ?? m;

/** "08:15" en hora de Asunción. */
export const horaCorta = (iso: string) =>
  new Intl.DateTimeFormat('es-PY', { timeZone: 'America/Asuncion', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));

/** "1 h 05 min" / "12 min" a partir de segundos. */
export function hace(segundos: number) {
  const m = Math.floor(segundos / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`;
}

/** Fecha de hoy en Asunción (AAAA-MM-DD), para el día de la tarea. */
export const hoyAsuncion = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(new Date());
