import { apiFetch } from './api.js';
import type { Pagina, ClienteFila, ClienteDetalle } from '@afull/shared';
import type { FiltrosTabla } from '../components/tabla/tipos.js';
import type { z } from 'zod';
import type {
  nuevoClienteSchema,
  patchClienteSchema,
} from '@afull/shared';

export type NuevoCliente = z.infer<typeof nuevoClienteSchema>;
export type PatchCliente = z.infer<typeof patchClienteSchema>;

export async function obtenerClientes(filtros: FiltrosTabla): Promise<Pagina<ClienteFila>> {
  const params = new URLSearchParams();

  if (filtros.q?.trim()) {
    params.set('q', filtros.q.trim());
  }

  if (filtros.estado === 'activos') {
    params.set('activo', 'true');
  } else if (filtros.estado === 'inactivos') {
    params.set('activo', 'false');
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
  const url = query ? `/api/clientes?${query}` : '/api/clientes';
  return apiFetch<Pagina<ClienteFila>>(url);
}

export async function obtenerCliente(id: string): Promise<ClienteDetalle> {
  return apiFetch<ClienteDetalle>(`/api/clientes/${id}`);
}

export async function crearCliente(datos: NuevoCliente): Promise<ClienteFila> {
  return apiFetch<ClienteFila>('/api/clientes', {
    method: 'POST',
    body: JSON.stringify(datos),
  });
}

export async function editarCliente(id: string, datos: PatchCliente): Promise<ClienteFila> {
  return apiFetch<ClienteFila>(`/api/clientes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(datos),
  });
}

export async function cambiarEstadoCliente(
  id: string,
  activo: boolean,
  updatedAt: string
): Promise<ClienteFila & { advertencia: string | null }> {
  return apiFetch<ClienteFila & { advertencia: string | null }>(`/api/clientes/${id}/estado`, {
    method: 'PATCH',
    body: JSON.stringify({ activo, updatedAt }),
  });
}
