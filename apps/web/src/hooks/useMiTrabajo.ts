import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { obtenerMiTrabajo } from '../lib/api-cronometro.js';
import { suscribirseLive } from '../lib/live.js';
import { ErrorApi } from '../lib/api.js';
import type { MiTrabajoRespuesta } from '@afull/shared';

export function useMiTrabajo() {
  const queryClient = useQueryClient();

  const query = useQuery<MiTrabajoRespuesta>({
    queryKey: ['mi-trabajo'],
    queryFn: obtenerMiTrabajo,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const cancelar = suscribirseLive(() => {
      void queryClient.invalidateQueries({ queryKey: ['mi-trabajo'] });
    });
    return cancelar;
  }, [queryClient]);

  const esErrorSinPersona =
    query.error instanceof ErrorApi &&
    query.error.status === 403 &&
    query.error.mensaje.toLowerCase().includes('no está vinculado');

  return {
    ...query,
    sinPersonaVinculada: esErrorSinPersona,
  };
}
