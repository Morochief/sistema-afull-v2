import { useQuery } from '@tanstack/react-query';
import { obtenerOT } from '../../lib/api-ots.js';
import type { ErrorApi } from '../../lib/api.js';
import type { OTDetalle } from '@afull/shared';

export function useOT(id: string | undefined) {
  return useQuery<OTDetalle, ErrorApi>({
    queryKey: ['ot', id],
    queryFn: () => {
      if (!id) throw new Error('ID de OT requerido');
      return obtenerOT(id);
    },
    enabled: Boolean(id),
  });
}
