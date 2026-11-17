import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { obtenerPanel } from '../lib/api-panel.js';
import { suscribirseLive } from '../lib/live.js';

/** Loop 14: se actualiza en vivo (mismo canal que Control en Vivo) y cada 60 s de respaldo. */
export function usePanel() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['panel'], queryFn: obtenerPanel, refetchInterval: 60_000 });
  useEffect(() => suscribirseLive(() => void qc.invalidateQueries({ queryKey: ['panel'] })), [qc]);
  return query;
}
