import { apiFetch } from './api.js';

/** Loop 17: constancia de entrega de cada parada hecha de la OT. */
export type EntregaOT = {
  parada_id: string; hoja_ruta_id: string; fecha: string; receptor_nombre: string; receptor_cargo: string | null; entregada_at: string;
  sin_senal: boolean; completada_por: string | null; remision_archivo_id: string | null; remision_por_llegar: boolean;
};
export const obtenerEntregas = (otId: string) => apiFetch<{ lleva_remision: boolean; entregas: EntregaOT[] }>(`/api/comercial/ot/${otId}/entregas`);
export const fijarRemision = (otId: string, lleva: boolean) =>
  apiFetch<{ lleva_remision: boolean }>(`/api/comercial/ot/${otId}/remision`, { method: 'POST', body: JSON.stringify({ lleva }) });
