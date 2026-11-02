import { useCallback } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useSearch, useNavigate } from '@tanstack/react-router';
import { obtenerOTs } from '../../lib/api-ots.js';
import type { FiltrosTabla } from '../../components/tabla/tipos.js';
import type { ErrorApi } from '../../lib/api.js';
import type { OTFila, Pagina } from '@afull/shared';

export type FiltrosOTUI = FiltrosTabla & {
  clienteId?: string;
};

export function useOTs(): {
  datos: Pagina<OTFila> | undefined;
  estado: { cargando: boolean; refrescando: boolean; error: ErrorApi | null };
  filtros: FiltrosOTUI;
  setFiltros: (c: Partial<FiltrosOTUI>) => void;
  reintentar: () => void;
} {
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const navigate = useNavigate();

  const filtros: FiltrosOTUI = {
    q: typeof search?.q === 'string' && search.q.trim() ? search.q : undefined,
    estado: typeof search?.estado === 'string' ? search.estado : 'todos',
    clienteId: typeof search?.clienteId === 'string' && search.clienteId ? search.clienteId : undefined,
    desde: typeof search?.desde === 'string' && search.desde ? search.desde : undefined,
    hasta: typeof search?.hasta === 'string' && search.hasta ? search.hasta : undefined,
    pagina: typeof search?.pagina === 'number' && search.pagina > 0 ? search.pagina : 1,
  };

  const {
    data: datos,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery<Pagina<OTFila>, ErrorApi>({
    queryKey: ['ots', filtros],
    queryFn: () => obtenerOTs(filtros),
    placeholderData: keepPreviousData,
  });

  const setFiltros = useCallback((cambio: Partial<FiltrosOTUI>) => {
    navigate({
      to: '/ots',
      search: (prev) => {
        const nuevo = { ...prev, ...cambio };
        return {
          q: nuevo.q ? String(nuevo.q) : undefined,
          estado: nuevo.estado && nuevo.estado !== 'todos' ? String(nuevo.estado) : undefined,
          clienteId: nuevo.clienteId ? String(nuevo.clienteId) : undefined,
          desde: nuevo.desde ? String(nuevo.desde) : undefined,
          hasta: nuevo.hasta ? String(nuevo.hasta) : undefined,
          pagina: nuevo.pagina && Number(nuevo.pagina) > 1 ? Number(nuevo.pagina) : undefined,
        };
      },
    });
  }, [navigate]);

  return {
    datos,
    estado: {
      cargando: isLoading,
      refrescando: isFetching && !isLoading,
      error: error || null,
    },
    filtros,
    setFiltros,
    reintentar: () => {
      refetch();
    },
  };
}
