import { apiFetch } from './api.js';
import type { TareaFila } from '@afull/shared';
import type { z } from 'zod';
import type {
  nuevaTareaSchema,
  patchTareaSchema,
  cancelarTareaSchema,
} from '@afull/shared';

export type NuevaTarea = z.infer<typeof nuevaTareaSchema>;
export type PatchTarea = z.infer<typeof patchTareaSchema>;
export type CancelarTarea = z.infer<typeof cancelarTareaSchema>;

export async function obtenerTareasOT(otId: string): Promise<TareaFila[]> {
  return apiFetch<TareaFila[]>(`/api/comercial/ot/${otId}/tareas`);
}

export async function crearTareaOT(otId: string, datos: NuevaTarea): Promise<TareaFila> {
  return apiFetch<TareaFila>(`/api/comercial/ot/${otId}/tareas`, {
    method: 'POST',
    body: JSON.stringify(datos),
  });
}

export async function editarTarea(tareaId: string, datos: PatchTarea): Promise<TareaFila> {
  return apiFetch<TareaFila>(`/api/tareas/${tareaId}`, {
    method: 'PATCH',
    body: JSON.stringify(datos),
  });
}

export async function cancelarTarea(tareaId: string, datos: CancelarTarea): Promise<TareaFila> {
  return apiFetch<TareaFila>(`/api/tareas/${tareaId}/cancelar`, {
    method: 'POST',
    body: JSON.stringify(datos),
  });
}
