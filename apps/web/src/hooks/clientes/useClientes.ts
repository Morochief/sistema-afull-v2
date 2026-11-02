import { useCallback } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useSearch, useNavigate } from '@tanstack/react-router';
import { obtenerClientes } from '../../lib/api-clientes.js';
import type { FiltrosTabla } from '../../components/tabla/tipos.js';
import type { ErrorApi } from '../../lib/api.js';
import type { ClienteFila, Pagina } from '@afull/shared';

export function useClientes(): {
  datos: Pagina<ClienteFila> | undefined;
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
  } = useQuery<Pagina<ClienteFila>, ErrorApi>({
    queryKey: ['clientes', filtros],
    queryFn: () => obtenerClientes(filtros),
    placeholderData: keepPreviousData,
  });

  // useCallback: BarraFiltros usa onFiltros como dependencia del debounce; una función nueva
  // en cada render reiniciaría el temporizador de 300 ms.
  const setFiltros = useCallback((cambio: Partial<FiltrosTabla>) => {
    navigate({
      to: '/clientes',
      search: (prev) => {
        const nuevo = { ...prev, ...cambio };
        return {
          q: nuevo.q ? String(nuevo.q) : undefined,
          estado: nuevo.estado ? String(nuevo.estado) : undefined,
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
