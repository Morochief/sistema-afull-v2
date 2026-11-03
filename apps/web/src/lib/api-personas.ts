import { apiFetch } from './api.js';
import type {
  Pagina,
  PersonaFila,
  PersonaAsignable,
  TarifaFila,
  UsuarioVinculable,
} from '@afull/shared';
import type { z } from 'zod';
import type {
  nuevaPersonaSchema,
  patchPersonaSchema,
  nuevaTarifaSchema,
  cerrarTarifaSchema,
} from '@afull/shared';

export type NuevaPersona = z.infer<typeof nuevaPersonaSchema>;
export type PatchPersona = z.infer<typeof patchPersonaSchema>;
export type NuevaTarifa = z.infer<typeof nuevaTarifaSchema>;
export type CerrarTarifa = z.infer<typeof cerrarTarifaSchema>;

export type FiltrosPersonas = {
  q?: string;
  activo?: string;
  pagina?: number;
};

export async function obtenerPersonas(filtros: FiltrosPersonas): Promise<Pagina<PersonaFila>> {
  const params = new URLSearchParams();
  if (filtros.q?.trim()) params.set('q', filtros.q.trim());
  if (filtros.activo && filtros.activo !== 'todos') params.set('activo', filtros.activo);
  if (filtros.pagina && filtros.pagina > 1) params.set('pagina', String(filtros.pagina));

  const query = params.toString();
  const url = query ? `/api/personas?${query}` : '/api/personas';
  return apiFetch<Pagina<PersonaFila>>(url);
}

export async function obtenerPersonasAsignables(q?: string): Promise<PersonaAsignable[]> {
  const url = q?.trim() ? `/api/personas/asignables?q=${encodeURIComponent(q.trim())}` : '/api/personas/asignables';
  return apiFetch<PersonaAsignable[]>(url);
}

export async function obtenerUsuariosVinculables(): Promise<UsuarioVinculable[]> {
  return apiFetch<UsuarioVinculable[]>('/api/usuarios/vinculables');
}

export async function crearPersona(datos: NuevaPersona): Promise<PersonaFila> {
  return apiFetch<PersonaFila>('/api/personas', {
    method: 'POST',
    body: JSON.stringify(datos),
  });
}

export async function editarPersona(id: string, datos: PatchPersona): Promise<PersonaFila> {
  return apiFetch<PersonaFila>(`/api/personas/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(datos),
  });
}

export async function cambiarEstadoPersona(id: string, activo: boolean, updatedAt: string): Promise<PersonaFila> {
  return apiFetch<PersonaFila>(`/api/personas/${id}/estado`, {
    method: 'PATCH',
    body: JSON.stringify({ activo, updatedAt }),
  });
}

export async function vincularUsuarioPersona(id: string, usuarioId: string | null): Promise<PersonaFila> {
  return apiFetch<PersonaFila>(`/api/personas/${id}/usuario`, {
    method: 'PATCH',
    body: JSON.stringify({ usuarioId }),
  });
}

export async function obtenerTarifasPersona(personaId: string): Promise<TarifaFila[]> {
  return apiFetch<TarifaFila[]>(`/api/personas/${personaId}/tarifas`);
}

export async function crearTarifaPersona(personaId: string, datos: NuevaTarifa): Promise<TarifaFila> {
  return apiFetch<TarifaFila>(`/api/personas/${personaId}/tarifas`, {
    method: 'POST',
    body: JSON.stringify(datos),
  });
}

export async function cerrarTarifa(tarifaId: string, datos: CerrarTarifa): Promise<TarifaFila> {
  return apiFetch<TarifaFila>(`/api/tarifas/${tarifaId}/cerrar`, {
    method: 'PATCH',
    body: JSON.stringify(datos),
  });
}
