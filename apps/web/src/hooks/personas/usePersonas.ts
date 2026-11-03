import { useCallback } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useSearch, useNavigate } from '@tanstack/react-router';
import { obtenerPersonas } from '../../lib/api-personas.js';
import type { FiltrosTabla } from '../../components/tabla/tipos.js';
import type { ErrorApi } from '../../lib/api.js';
import type { PersonaFila, Pagina } from '@afull/shared';

export function usePersonas(): {
  datos: Pagina<PersonaFila> | undefined;
  estado: { cargando: boolean; refrescando: boolean; error: ErrorApi | null };
  filtros: FiltrosTabla;
  setFiltros: (c: Partial<FiltrosTabla>) => void;
  reintentar: () => void;
} {
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const navigate = useNavigate();

  const filtros: FiltrosTabla = {
    q: typeof search?.q === 'string' && search.q.trim() ? search.q : undefined,
    estado: typeof search?.estado === 'string' ? search.estado : 'activos',
    desde: undefined,
    hasta: undefined,
    pagina: typeof search?.pagina === 'number' && search.pagina > 0 ? search.pagina : 1,
  };

  const {
    data: datos,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery<Pagina<PersonaFila>, ErrorApi>({
    queryKey: ['personas', filtros],
    queryFn: () => {
      let paramActivo: string | undefined;
      if (filtros.estado === 'activos') paramActivo = 'true';
      else if (filtros.estado === 'inactivos') paramActivo = 'false';
      return obtenerPersonas({
        q: filtros.q,
        activo: paramActivo,
        pagina: filtros.pagina,
      });
    },
    placeholderData: keepPreviousData,
  });

  const setFiltros = useCallback(
    (cambio: Partial<FiltrosTabla>) => {
      navigate({
        to: '/personas',
        search: (prev) => {
          const nuevo = { ...prev, ...cambio };
          return {
            q: nuevo.q ? String(nuevo.q) : undefined,
            estado: nuevo.estado ? String(nuevo.estado) : undefined,
            pagina: nuevo.pagina && Number(nuevo.pagina) > 1 ? Number(nuevo.pagina) : undefined,
          };
        },
      });
    },
    [navigate]
  );

  return {
    datos,
    estado: {
      cargando: isLoading,
      refrescando: isFetching && !isLoading,
      error: error ?? null,
    },
    filtros,
    setFiltros,
    reintentar: () => void refetch(),
  };
}
