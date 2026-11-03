import { apiFetch } from './api.js';
import type { UnidadInsumo } from '@afull/shared';

const json = (body: unknown) => ({ body: JSON.stringify(body) });

export type Insumo = { id: string; nombre: string; unidad: UnidadInsumo; sector: string | null; activo: boolean; costo_unitario_gs: number | null };
export type ConsumoFila = {
  id: string; insumo: string; unidad: UnidadInsumo; cantidad: number; costo_unitario_gs: number; total_gs: number;
  es_desperdicio: boolean; corrige_id: string | null; corregido: boolean; nota: string | null; created_at: string;
  persona: string | null; cargado_por: string; tarea: string | null;
};
export type ConsumosOT = { items: ConsumoFila[]; total_gs: number; desperdicio_gs: number };
type Pieza = { anchoM: number; altoM: number; cantidad: number };

export const buscarInsumos = (q: string, todos = false) => {
  const p = new URLSearchParams();
  if (q.trim()) p.set('q', q.trim());
  if (todos) p.set('todos', 'true');
  const s = p.toString();
  return apiFetch<Insumo[]>(`/api/insumos${s ? `?${s}` : ''}`);
};
export const crearInsumo = (d: { nombre: string; unidad: UnidadInsumo; sector?: string; costoUnitarioGs: number }) =>
  apiFetch<{ id: string }>('/api/insumos', { method: 'POST', ...json(d) });
export const editarInsumo = (id: string, d: { activo?: boolean; nombre?: string }) =>
  apiFetch<{ id: string }>(`/api/insumos/${id}`, { method: 'PATCH', ...json(d) });
export const nuevoPrecioInsumo = (id: string, costoUnitarioGs: number) =>
  apiFetch<{ id: string }>(`/api/insumos/${id}/precios`, { method: 'POST', ...json({ costoUnitarioGs }) });

export const consumosDeOT = (otId: string) => apiFetch<ConsumosOT>(`/api/consumos/ot/${otId}`);
export const cargarConsumo = (d: { otId: string; tareaId?: string; insumoId: string; cantidad: number; esDesperdicio?: boolean; nota?: string; claveIdempotencia: string }) =>
  apiFetch<{ ids: string[] }>('/api/consumos', { method: 'POST', ...json(d) });
export const cargarMerma = (d: { otId: string; tareaId?: string; insumoId: string; insumoDesperdicioId?: string; anchoMaterialM: number; largoUsadoM: number; piezas: Pieza[]; claveIdempotencia: string }) =>
  apiFetch<{ aprovechamientoPct: number; m2Piezas: number; m2Desperdicio: number }>('/api/consumos/merma', { method: 'POST', ...json(d) });
export const cargarCompartido = (d: { insumoId: string; cantidadTotal: number; repartos: { otId: string; m2Piezas: number }[]; nota?: string; claveIdempotencia: string }) =>
  apiFetch<{ partes: number[] }>('/api/consumos/compartido', { method: 'POST', ...json(d) });
export const anularConsumo = (id: string, motivo: string) =>
  apiFetch<{ id: string }>(`/api/consumos/${id}/anular`, { method: 'POST', ...json({ motivo, claveIdempotencia: crypto.randomUUID() }) });

export const UNIDAD_CORTA: Record<UnidadInsumo, string> = {
  UNIDAD: 'u.', METRO: 'm', M2: 'm²', PLANCHA: 'plancha', LITRO: 'l', KG: 'kg', ROLLO: 'rollo', LATA: 'lata',
  BOLSA: 'bolsa', PAR: 'par', TIRA: 'tira', MINUTO: 'min', KM: 'km',
};
