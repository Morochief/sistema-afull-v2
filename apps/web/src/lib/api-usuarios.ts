import type { Pagina, Capacidad } from '@afull/shared';
import { apiFetch } from './api.js';

/** Administración de usuarios (solo admin) y cambio de la propia contraseña. */
export type UsuarioFila = {
  id: string; username: string; activo: boolean; created_at: string; persona_id: string | null; persona_nombre: string | null;
  capacidades: Capacidad[]; ultimo_acceso: string | null;
};
const json = (b: unknown) => ({ body: JSON.stringify(b) });

export const listarUsuarios = (f: { q?: string; activo?: string; pagina: number }) =>
  apiFetch<Pagina<UsuarioFila>>('/api/usuarios', { params: f });
export const crearUsuario = (d: { username: string; password: string; capacidades: Capacidad[] }) =>
  apiFetch<{ id: string; username: string }>('/api/usuarios', { method: 'POST', ...json(d) });
export const editarUsuario = (id: string, d: { capacidades?: Capacidad[]; activo?: boolean }) =>
  apiFetch<UsuarioFila>(`/api/usuarios/${id}`, { method: 'PATCH', ...json(d) });
export const resetearClave = (id: string, password: string) =>
  apiFetch<{ id: string }>(`/api/usuarios/${id}/password`, { method: 'POST', ...json({ password }) });
export const cambiarMiClave = (actual: string, nueva: string) =>
  apiFetch<{ ok: true }>('/api/auth/cambiar-password', { method: 'POST', ...json({ actual, nueva }) });
