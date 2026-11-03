import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { obtenerEstadoLive } from '../lib/api-live.js';
import { suscribirseLive } from '../lib/live.js';
import type { LiveEstadoRespuesta } from '@afull/shared';

export function useLive() {
  const queryClient = useQueryClient();

  const query = useQuery<LiveEstadoRespuesta>({
    queryKey: ['live'],
    queryFn: obtenerEstadoLive,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const cancelar = suscribirseLive(() => {
      void queryClient.invalidateQueries({ queryKey: ['live'] });
      void queryClient.invalidateQueries({ queryKey: ['mi-trabajo'] });
    });
    return cancelar;
  }, [queryClient]);

  return query;
}
