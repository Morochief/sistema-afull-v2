import { apiFetch } from './api.js';
import type { SucursalFila, ContactoFila, MarcaFila } from '@afull/shared';
import type { z } from 'zod';
import type {
  sucursalSchema,
  patchSucursalSchema,
  contactoSchema,
  patchContactoSchema,
  marcaSchema,
  patchMarcaSchema,
} from '@afull/shared';

export type NuevaSucursal = z.infer<typeof sucursalSchema>;
export type PatchSucursal = z.infer<typeof patchSucursalSchema>;
export type NuevoContacto = z.infer<typeof contactoSchema>;
export type PatchContacto = z.infer<typeof patchContactoSchema>;
export type NuevaMarca = z.infer<typeof marcaSchema>;
export type PatchMarca = z.infer<typeof patchMarcaSchema>;

// --- SUCURSALES ---
export async function crearSucursal(clienteId: string, datos: NuevaSucursal): Promise<SucursalFila> {
  return apiFetch<SucursalFila>(`/api/clientes/${clienteId}/sucursales`, {
    method: 'POST',
    body: JSON.stringify(datos),
  });
}

export async function editarSucursal(
  clienteId: string,
  sucId: string,
  datos: PatchSucursal
): Promise<SucursalFila> {
  return apiFetch<SucursalFila>(`/api/clientes/${clienteId}/sucursales/${sucId}`, {
    method: 'PATCH',
    body: JSON.stringify(datos),
  });
}

export async function cambiarEstadoSucursal(
  clienteId: string,
  sucId: string,
  activo: boolean,
  updatedAt: string
): Promise<SucursalFila> {
  return apiFetch<SucursalFila>(`/api/clientes/${clienteId}/sucursales/${sucId}/estado`, {
    method: 'PATCH',
    body: JSON.stringify({ activo, updatedAt }),
  });
}

// --- CONTACTOS ---
export async function crearContacto(clienteId: string, datos: NuevoContacto): Promise<ContactoFila> {
  return apiFetch<ContactoFila>(`/api/clientes/${clienteId}/contactos`, {
    method: 'POST',
    body: JSON.stringify(datos),
  });
}

export async function editarContacto(
  clienteId: string,
  contactoId: string,
  datos: PatchContacto
): Promise<ContactoFila> {
  return apiFetch<ContactoFila>(`/api/clientes/${clienteId}/contactos/${contactoId}`, {
    method: 'PATCH',
    body: JSON.stringify(datos),
  });
}

export async function cambiarEstadoContacto(
  clienteId: string,
  contactoId: string,
  activo: boolean
): Promise<ContactoFila> {
  return apiFetch<ContactoFila>(`/api/clientes/${clienteId}/contactos/${contactoId}/estado`, {
    method: 'PATCH',
    body: JSON.stringify({ activo }),
  });
}

// --- MARCAS ---
export async function crearMarca(clienteId: string, datos: NuevaMarca): Promise<MarcaFila> {
  return apiFetch<MarcaFila>(`/api/clientes/${clienteId}/marcas`, {
    method: 'POST',
    body: JSON.stringify(datos),
  });
}

export async function editarMarca(
  clienteId: string,
  marcaId: string,
  datos: PatchMarca
): Promise<MarcaFila> {
  return apiFetch<MarcaFila>(`/api/clientes/${clienteId}/marcas/${marcaId}`, {
    method: 'PATCH',
    body: JSON.stringify(datos),
  });
}

export async function cambiarEstadoMarca(
  clienteId: string,
  marcaId: string,
  activo: boolean
): Promise<MarcaFila> {
  return apiFetch<MarcaFila>(`/api/clientes/${clienteId}/marcas/${marcaId}/estado`, {
    method: 'PATCH',
    body: JSON.stringify({ activo }),
  });
}
