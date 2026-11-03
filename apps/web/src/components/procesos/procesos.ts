import { useQuery } from '@tanstack/react-query';
import type { AreaProceso } from '@afull/shared';
import { listarProcesos } from '../../lib/api-procesos.js';

export const AREAS: Record<AreaProceso, string> = {
  TALLER: 'Taller',
  CALLE: 'Calle',
  DISENO: 'Diseño',
  COMERCIAL: 'Comercial',
  OTRO: 'Otro',
};

/** Catálogo de procesos compartido (se cachea 5 min). */
export function useProcesos() {
  return useQuery({ queryKey: ['procesos'], queryFn: listarProcesos, staleTime: 5 * 60_000 });
}
