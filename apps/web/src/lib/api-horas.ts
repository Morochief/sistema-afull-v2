import { apiFetch } from './api.js';

/** Loop 13: horas de una persona y sus correcciones (Juan, Gerardo y Sofi). */
export type TramoHoras = {
  id: string; hora_inicio: string; hora_fin: string | null; hora_fin_original: string | null; abierto: boolean; segundos: number;
  origen: 'RELOJ' | 'MANUAL'; motivo_manual: string | null; cargado_por: string | null; motivo_correccion: string | null; corregido_por: string | null;
  tarea_id: string; tarea: string; ot_codigo: string; cliente: string; en_tanda: boolean;
};
export type HorasPersona = { items: TramoHoras[]; total: number; pagina: number; segundos_periodo: number };
export type TareaParaHoras = { id: string; descripcion: string; estado: string; codigo_ot: string; cliente: string };

const post = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) });

export const horasDePersona = (personaId: string, desde: string, hasta: string, pagina: number) =>
  apiFetch<HorasPersona>(`/api/personas/${personaId}/horas?desde=${desde}&hasta=${hasta}&pagina=${pagina}`);
export const cerrarConHora = (id: string, horaFin: string, motivo: string) => apiFetch<{ id: string }>(`/api/horas/${id}/cerrar`, post({ horaFin, motivo }));
export const corregirFin = (id: string, horaFin: string, motivo: string) => apiFetch<{ id: string }>(`/api/horas/${id}/correccion`, post({ horaFin, motivo }));
export const cargarHorasManual = (d: { tareaId: string; personaId: string; horaInicio: string; horaFin: string; motivo: string }) =>
  apiFetch<{ id: string }>('/api/horas/manual', post({ ...d, claveIdempotencia: crypto.randomUUID() }));
export const tareasParaHoras = (personaId: string) => apiFetch<TareaParaHoras[]>(`/api/horas/persona/${personaId}/tareas`);

/** "8 h 30 min", "45 min". */
export function duracion(segundos: number) {
  const m = Math.round(segundos / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`;
}
/** Valor de un <input type="datetime-local"> (hora del navegador) → ISO con zona. */
export const aIso = (local: string) => new Date(local).toISOString();
