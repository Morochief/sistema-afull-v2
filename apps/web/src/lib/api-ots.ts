import { apiFetch } from './api.js';
import type { Pagina, OTFila, OTDetalle } from '@afull/shared';
import type { z } from 'zod';
import type {
  nuevaOTSchema,
  patchOTSchema,
  transicionSchema,
} from '@afull/shared';

export type NuevaOT = z.infer<typeof nuevaOTSchema>;
export type PatchOT = z.infer<typeof patchOTSchema>;
export type TransicionOT = z.infer<typeof transicionSchema>;

export type FiltrosOT = {
  q?: string;
  estado?: string;
  clienteId?: string;
  desde?: string;
  hasta?: string;
  pagina: number;
};

export async function obtenerOTs(filtros: FiltrosOT): Promise<Pagina<OTFila>> {
  const params = new URLSearchParams();

  if (filtros.q?.trim()) {
    params.set('q', filtros.q.trim());
  }

  if (filtros.estado && filtros.estado !== 'todos') {
    params.set('estado', filtros.estado);
  }

  if (filtros.clienteId) {
    params.set('clienteId', filtros.clienteId);
  }

  if (filtros.desde) {
    params.set('desde', filtros.desde);
  }

  if (filtros.hasta) {
    params.set('hasta', filtros.hasta);
  }

  if (filtros.pagina && filtros.pagina > 1) {
    params.set('pagina', String(filtros.pagina));
  }

  const query = params.toString();
  const url = query ? `/api/comercial/ot?${query}` : '/api/comercial/ot';
  return apiFetch<Pagina<OTFila>>(url);
}

export async function obtenerOT(id: string): Promise<OTDetalle> {
  return apiFetch<OTDetalle>(`/api/comercial/ot/${id}`);
}

export async function crearOT(datos: NuevaOT): Promise<OTFila> {
  return apiFetch<OTFila>('/api/comercial/ot', {
    method: 'POST',
    body: JSON.stringify(datos),
  });
}

export async function editarOT(id: string, datos: PatchOT): Promise<OTFila> {
  return apiFetch<OTFila>(`/api/comercial/ot/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(datos),
  });
}

export async function transicionarOT(id: string, datos: TransicionOT): Promise<OTFila> {
  return apiFetch<OTFila>(`/api/comercial/ot/${id}/transicionar`, {
    method: 'POST',
    body: JSON.stringify(datos),
  });
}
