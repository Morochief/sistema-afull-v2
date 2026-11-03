import { apiFetch } from './api.js';
import type {
  Pagina,
  PresupuestoFila,
  PresupuestoDetalle,
  ProyectoFila,
  ProyectoDetalle,
  EstadoPresupuesto,
  NuevoPresupuestoInput,
  PatchPresupuestoInput,
  ItemPresupuestoInput,
  PatchItemPresupuestoInput,
} from '@afull/shared';

export type FiltrosListado = {
  q?: string;
  estado?: string;
  clienteId?: string;
  desde?: string;
  hasta?: string;
  pagina: number;
};

export type AccionPresupuesto = 'enviar' | 'aprobar' | 'rechazar' | 'anular' | 'nueva-version';

export type ResultadoAprobacion = {
  id: string;
  estado: 'APROBADO';
  proyecto: { id: string; codigo: string } | null;
  ots: { id: string; codigo_ot: string; sucursal_id: string | null; monto_presupuestado_gs: number }[];
};

/** Arma la query string igual que los otros listados (sin parámetros vacíos ni 'todos'). */
export function queryListado(f: FiltrosListado): string {
  const p = new URLSearchParams();
  if (f.q?.trim()) p.set('q', f.q.trim());
  if (f.estado && f.estado !== 'todos') p.set('estado', f.estado);
  if (f.clienteId) p.set('clienteId', f.clienteId);
  if (f.desde) p.set('desde', f.desde);
  if (f.hasta) p.set('hasta', f.hasta);
  if (f.pagina > 1) p.set('pagina', String(f.pagina));
  const q = p.toString();
  return q ? `?${q}` : '';
}

const json = (body: unknown) => ({ body: JSON.stringify(body) });

export const obtenerPresupuestos = (f: FiltrosListado) =>
  apiFetch<Pagina<PresupuestoFila>>(`/api/presupuestos${queryListado(f)}`);

export const obtenerPresupuesto = (id: string) => apiFetch<PresupuestoDetalle>(`/api/presupuestos/${id}`);

export const crearPresupuesto = (d: Partial<NuevoPresupuestoInput> & { clienteId: string; titulo: string }) =>
  apiFetch<{ id: string; numero: string }>('/api/presupuestos', { method: 'POST', ...json(d) });

export const editarPresupuesto = (id: string, d: PatchPresupuestoInput) =>
  apiFetch<{ id: string }>(`/api/presupuestos/${id}`, { method: 'PATCH', ...json(d) });

export const agregarItemPresupuesto = (id: string, d: Partial<ItemPresupuestoInput>) =>
  apiFetch<{ id: string }>(`/api/presupuestos/${id}/items`, { method: 'POST', ...json(d) });

export const editarItemPresupuesto = (id: string, itemId: string, d: PatchItemPresupuestoInput) =>
  apiFetch<{ id: string }>(`/api/presupuestos/${id}/items/${itemId}`, { method: 'PATCH', ...json(d) });

export const accionPresupuesto = (id: string, accion: AccionPresupuesto, desde: EstadoPresupuesto, comentario?: string) =>
  apiFetch<{ id: string } & Partial<ResultadoAprobacion>>(`/api/presupuestos/${id}/${accion}`, {
    method: 'POST',
    ...json({ desde, comentario }),
  });

export const obtenerProyectos = (f: FiltrosListado) =>
  apiFetch<Pagina<ProyectoFila>>(`/api/proyectos${queryListado(f)}`);

export const obtenerProyecto = (id: string) => apiFetch<ProyectoDetalle>(`/api/proyectos/${id}`);

export const finalizarProyecto = (id: string, accion: 'cerrar' | 'cancelar', comentario?: string) =>
  apiFetch<{ id: string }>(`/api/proyectos/${id}/${accion}`, { method: 'POST', ...json({ comentario }) });

export const asociarProyectoOT = (otId: string, proyectoId: string | null, updatedAt: string) =>
  apiFetch<{ id: string }>(`/api/comercial/ot/${otId}/proyecto`, { method: 'POST', ...json({ proyectoId, updatedAt }) });
