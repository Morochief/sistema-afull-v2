import { useCallback } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useSearch, useNavigate } from '@tanstack/react-router';
import type { Pagina } from '@afull/shared';
import type { FiltrosTabla } from '../components/tabla/tipos.js';
import type { ErrorApi } from '../lib/api.js';
import type { FiltrosListado } from '../lib/api-presupuestos.js';

/**
 * Listado administrativo con los filtros en la URL (misma convención que useOTs):
 * 25 filas por servidor, búsqueda, estado y rango de fechas; volver atrás conserva el filtro.
 */
export function useListadoUrl<T>(
  ruta: '/presupuestos' | '/proyectos',
  clave: string,
  fetcher: (f: FiltrosListado) => Promise<Pagina<T>>
) {
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const navigate = useNavigate();
  const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);

  const filtros: FiltrosTabla = {
    q: texto(search?.q),
    estado: texto(search?.estado) ?? 'todos',
    desde: texto(search?.desde),
    hasta: texto(search?.hasta),
    pagina: typeof search?.pagina === 'number' && search.pagina > 0 ? search.pagina : 1,
  };

  const { data, isLoading, isFetching, error, refetch } = useQuery<Pagina<T>, ErrorApi>({
    queryKey: [clave, filtros],
    queryFn: () => fetcher({ ...filtros, pagina: filtros.pagina ?? 1 }),
    placeholderData: keepPreviousData,
  });

  const setFiltros = useCallback(
    (cambio: Partial<FiltrosTabla>) => {
      navigate({
        to: ruta,
        search: (prev: Record<string, unknown>) => {
          const n = { ...prev, ...cambio } as Record<string, unknown>;
          return {
            q: n.q ? String(n.q) : undefined,
            estado: n.estado && n.estado !== 'todos' ? String(n.estado) : undefined,
            desde: n.desde ? String(n.desde) : undefined,
            hasta: n.hasta ? String(n.hasta) : undefined,
            pagina: n.pagina && Number(n.pagina) > 1 ? Number(n.pagina) : undefined,
          };
        },
      });
    },
    [navigate, ruta]
  );

  return {
    datos: data,
    estado: { cargando: isLoading, refrescando: isFetching && !isLoading, error: error || null },
    filtros,
    setFiltros,
    reintentar: () => void refetch(),
  };
}
