import { AlertTriangle, FolderOpen, FilterX } from 'lucide-react';
import type { ErrorApi } from '../../lib/api.js';
import type { FiltrosTabla } from './tipos.js';
import { Button } from '../ui/button.js';
import { Skeleton } from '../ui/skeleton.js';

export function EsqueletoTabla({ columnasCount }: { columnasCount: number }) {
  return (
    <tbody aria-busy="true" className="divide-y divide-[#1f2937]">
      {Array.from({ length: 8 }).map((_, i) => (
        <tr key={i} className="animate-pulse">
          {Array.from({ length: columnasCount }).map((_, j) => (
            <td key={j} className="p-3">
              <Skeleton className="h-4 w-full max-w-[85%]" />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

export function ErrorTabla({
  error,
  onReintentar,
}: {
  error: ErrorApi;
  onReintentar: () => void;
}) {
  const mensaje =
    typeof error.detalle === 'string'
      ? error.detalle
      : Array.isArray(error.detalle)
      ? error.detalle.map((d) => d.message).join(', ')
      : error.message || 'Error al cargar los registros';

  return (
    <div className="flex flex-col items-center justify-center p-12 text-center rounded-md border border-red-900/40 bg-red-950/10">
      <div className="rounded-full bg-red-950/50 p-3 text-red-400 mb-3 border border-red-800/40">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h3 className="text-sm font-semibold text-white mb-1">Ocurrió un error</h3>
      <p className="text-xs text-red-300 max-w-md mb-4">{mensaje}</p>
      <Button size="sm" variant="outline" onClick={onReintentar} className="text-xs">
        Reintentar
      </Button>
    </div>
  );
}

export function VacioTabla({
  filtros,
  vacio,
  onLimpiarFiltros,
}: {
  filtros: FiltrosTabla;
  vacio: { titulo: string; descripcion?: string };
  onLimpiarFiltros: () => void;
}) {
  const tieneFiltrosActivos = Boolean(
    filtros.q ||
    (filtros.estado && filtros.estado !== 'todos') ||
    filtros.desde ||
    filtros.hasta
  );

  if (tieneFiltrosActivos) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="rounded-full bg-[#111318] p-3 text-neutral-400 mb-3 border border-[#1f2937]">
          <FilterX className="h-6 w-6" />
        </div>
        <h3 className="text-sm font-semibold text-white mb-1">
          Sin resultados para estos filtros
        </h3>
        <p className="text-xs text-neutral-400 max-w-sm mb-4">
          No se encontraron registros que coincidan con los criterios de búsqueda aplicados.
        </p>
        <Button size="sm" variant="outline" onClick={onLimpiarFiltros} className="text-xs">
          Limpiar filtros
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-12 text-center">
      <div className="rounded-full bg-[#111318] p-3 text-neutral-400 mb-3 border border-[#1f2937]">
        <FolderOpen className="h-6 w-6 text-neutral-400" />
      </div>
      <h3 className="text-sm font-semibold text-white mb-1">{vacio.titulo}</h3>
      {vacio.descripcion && (
        <p className="text-xs text-neutral-400 max-w-sm">{vacio.descripcion}</p>
      )}
    </div>
  );
}
