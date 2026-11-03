import { apiFetch } from './api.js';
import type { Proceso, AreaProceso } from '@afull/shared';

const json = (body: unknown) => ({ body: JSON.stringify(body) });

export const listarProcesos = () => apiFetch<Proceso[]>('/api/procesos');
export const crearProceso = (d: { nombre: string; area: AreaProceso }) =>
  apiFetch<Proceso>('/api/procesos', { method: 'POST', ...json(d) });
export const editarProceso = (codigo: string, d: { nombre?: string; area?: AreaProceso; activo?: boolean }) =>
  apiFetch<Proceso>(`/api/procesos/${codigo}`, { method: 'PATCH', ...json(d) });
