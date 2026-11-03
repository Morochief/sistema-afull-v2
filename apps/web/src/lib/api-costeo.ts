import type { Pagina } from '@afull/shared';
import { apiFetch } from './api.js';
import { queryListado, type FiltrosListado } from './api-presupuestos.js';

export type LineaManoObra = { persona: string; proceso: string; horas: number; tarifa_hora_gs: number | null; costo_gs: number; sin_tarifa: boolean };
export type LineaViaje = { viaje_id: string; fecha: string; chapa: string; km_viaje: number; ots_en_hoja: number; km_ot: number; costo_km_gs: number; costo_gs: number };
export type CosteoOT = {
  congelado: boolean; congelado_at: string | null;
  horas: number; mano_obra_gs: number; material_gs: number; desperdicio_gs: number; km: number; km_gs: number; total_gs: number;
  monto_presupuestado_gs: number | null; margen_pct: number | null;
  mano_obra: LineaManoObra[]; viajes: LineaViaje[]; alertas: string[];
};
export type CosteoProyectoFila = {
  id: string; codigo_ot: string; titulo: string; estado: string; congelado: boolean;
  mano_obra_gs: number; material_gs: number; km_gs: number; total_gs: number; monto_presupuestado_gs: number | null; margen_pct: number | null;
};
export type CosteoProyecto = {
  ots: CosteoProyectoFila[]; mano_obra_gs: number; material_gs: number; km_gs: number; total_gs: number;
  monto_presupuestado_gs: number; margen_pct: number | null;
};
export type RentabilidadFila = {
  id: string; codigo_ot: string; titulo: string; cliente_nombre: string; estado_final: 'TERMINADO' | 'CANCELADO'; cerrado_at: string;
  horas: number; mano_obra_gs: number; material_gs: number; km_gs: number; total_gs: number;
  monto_presupuestado_gs: number | null; margen_pct: number | null;
};
export type PaginaRentabilidad = Pagina<RentabilidadFila> & { resumen: { costo_gs: number; venta_gs: number; margen_pct: number | null } };

export const costeoDeOT = (id: string) => apiFetch<CosteoOT>(`/api/costeo/ot/${id}`);
export const costeoDeProyecto = (id: string) => apiFetch<CosteoProyecto>(`/api/costeo/proyecto/${id}`);
export const listarRentabilidad = (f: FiltrosListado) => apiFetch<PaginaRentabilidad>(`/api/costeo/ots${queryListado(f)}`);
