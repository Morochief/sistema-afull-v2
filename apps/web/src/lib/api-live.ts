import { apiFetch } from './api.js';
import type { LiveEstadoRespuesta } from '@afull/shared';

export async function obtenerEstadoLive(): Promise<LiveEstadoRespuesta> {
  return apiFetch<LiveEstadoRespuesta>('/api/live/estado');
}
