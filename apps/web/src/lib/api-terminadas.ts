import type { MiTrabajoTerminadas } from '@afull/shared';
import { apiFetch } from './api.js';

/** Loop 15: lo que ya terminé. */
export const obtenerTerminadas = (desde: string, hasta: string, pagina: number) =>
  apiFetch<MiTrabajoTerminadas>(`/api/mi-trabajo/terminadas?${new URLSearchParams({ desde, hasta, pagina: String(pagina) })}`);

export type Periodo = 'semana' | 'semana_pasada' | 'mes';
export const NOMBRE_PERIODO: Record<Periodo, string> = { semana: 'Esta semana', semana_pasada: 'Semana pasada', mes: 'Este mes' };

const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Día de hoy en Asunción como fecha UTC a medianoche (para sumar días sin problemas de zona). */
const hoyUTC = (ahora = new Date()) => new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(ahora)}T00:00:00Z`);
const mas = (d: Date, dias: number) => new Date(d.getTime() + dias * 86_400_000);

/** Rango del período en fechas de Asunción. Las semanas empiezan el lunes. */
export function rangoPeriodo(p: Periodo, ahora = new Date()): { desde: string; hasta: string } {
  const hoy = hoyUTC(ahora);
  const lunes = mas(hoy, -((hoy.getUTCDay() + 6) % 7));
  if (p === 'semana') return { desde: iso(lunes), hasta: iso(hoy) };
  if (p === 'semana_pasada') return { desde: iso(mas(lunes, -7)), hasta: iso(mas(lunes, -1)) };
  return { desde: iso(new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1))), hasta: iso(hoy) };
}

/** "32 h 15 min" / "45 min". */
export function duracionLarga(segundos: number) {
  const m = Math.round(segundos / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

export const cuandoTermino = (isoFecha: string) =>
  new Intl.DateTimeFormat('es-PY', { timeZone: 'America/Asuncion', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date(isoFecha));
