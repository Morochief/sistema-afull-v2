import { useQuery } from '@tanstack/react-query';
import { AREAS_PROCESO, type AreaProceso } from '@afull/shared';
import { listarProcesos } from '../../lib/api-procesos.js';

/** Loop 22: las áreas de trabajo de aFull, en su orden. */
export const AREAS: Record<AreaProceso, string> = AREAS_PROCESO;

/** Catálogo de procesos compartido (se cachea 5 min). */
export function useProcesos() {
  return useQuery({ queryKey: ['procesos'], queryFn: listarProcesos, staleTime: 5 * 60_000 });
}
