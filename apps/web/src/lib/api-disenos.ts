import { apiFetch } from './api.js';
import type { DisenoVersion, DisenoEnCola, OrigenDiseno } from '@afull/shared';

const json = (body: unknown) => ({ body: JSON.stringify(body) });

export const versionesDiseno = (otId: string) => apiFetch<DisenoVersion[]>(`/api/disenos/ot/${otId}`);

export const subirDiseno = (otId: string, d: { origen: OrigenDiseno; driveUrl: string; notas?: string }) =>
  apiFetch<{ id: string; version: number }>(`/api/disenos/ot/${otId}`, { method: 'POST', ...json(d) });

export const aprobarDiseno = (id: string) => apiFetch<{ id: string }>(`/api/disenos/${id}/aprobar`, { method: 'POST' });

export const observarDiseno = (id: string, observacion: string) =>
  apiFetch<{ id: string }>(`/api/disenos/${id}/observar`, { method: 'POST', ...json({ observacion }) });

export const disenosPorRevisar = () => apiFetch<DisenoEnCola[]>('/api/disenos/pendientes');

export const colaProduccion = () => apiFetch<DisenoEnCola[]>('/api/disenos/cola');
