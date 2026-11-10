import { apiFetch } from './api.js';
import type { MiTrabajoRespuesta } from '@afull/shared';
import type { z } from 'zod';
import type {
  pausarTareaSchema,
  finalizarTareaSchema,
} from '@afull/shared';

export type PausarTarea = z.infer<typeof pausarTareaSchema>;
export type FinalizarTarea = z.infer<typeof finalizarTareaSchema>;

export async function obtenerMiTrabajo(): Promise<MiTrabajoRespuesta> {
  return apiFetch<MiTrabajoRespuesta>('/api/mi-trabajo');
}

export async function iniciarTarea(
  tareaId: string,
  claveIdempotencia: string
): Promise<{ ok: boolean; intervaloId: string; autoPausadaTareaId?: string }> {
  return apiFetch(`/api/mi-trabajo/tareas/${tareaId}/iniciar`, {
    method: 'POST',
    body: JSON.stringify({ claveIdempotencia }),
  });
}

export async function pausarTarea(
  tareaId: string,
  datos: PausarTarea
): Promise<{ ok: boolean }> {
  return apiFetch(`/api/mi-trabajo/tareas/${tareaId}/pausar`, {
    method: 'POST',
    body: JSON.stringify(datos),
  });
}

export async function finalizarTarea(
  tareaId: string,
  datos: FinalizarTarea
): Promise<{ ok: boolean }> {
  return apiFetch(`/api/mi-trabajo/tareas/${tareaId}/finalizar`, {
    method: 'POST',
    body: JSON.stringify(datos),
  });
}

/** Loop 12: arranca una tanda de máquina para varias OTs (el tiempo se reparte por m²). La primera es la principal. */
export async function iniciarTanda(tareas: { tareaId: string; m2Piezas: number }[]): Promise<{ tandaId: string; tareaId: string }> {
  return apiFetch('/api/mi-trabajo/tanda', { method: 'POST', body: JSON.stringify({ tareas, claveIdempotencia: crypto.randomUUID() }) });
}
