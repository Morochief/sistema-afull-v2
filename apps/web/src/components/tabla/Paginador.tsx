import { ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { Button } from '../ui/button.js';

export type PaginadorProps = {
  pagina: number;
  total: number;
  tamPagina: number;
  totalPaginas: number;
  tieneItems: boolean;
  onCambiarPagina: (nuevaPagina: number) => void;
};

export function Paginador({
  pagina,
  total,
  totalPaginas,
  tieneItems,
  onCambiarPagina,
}: PaginadorProps) {
  const paginasCalculadas = Math.max(1, totalPaginas);
  const esPaginaFueraDeRango = !tieneItems && total > 0;

  if (esPaginaFueraDeRango) {
    return (
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-md border border-amber-900/50 bg-amber-950/20 text-amber-200">
        <div className="flex items-center gap-2 text-xs">
          <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
          <span>Página fuera de rango ({total} resultados registrados).</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onCambiarPagina(paginasCalculadas)}
          className="text-xs border-amber-800/60 text-amber-300 hover:bg-amber-900/40"
        >
          Ir a la última página ({paginasCalculadas})
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between px-2 py-3 text-xs text-neutral-400 border-t border-[#1f2937]">
      <div aria-live="polite" aria-atomic="true">
        <span className="font-medium text-neutral-200">{total}</span> resultados · página{' '}
        <span className="font-medium text-neutral-200">{pagina}</span> de{' '}
        <span className="font-medium text-neutral-200">{paginasCalculadas}</span>
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={pagina <= 1}
          onClick={() => onCambiarPagina(pagina - 1)}
          className="h-8 px-2.5 text-xs text-neutral-300 disabled:opacity-40"
          aria-label="Página anterior"
        >
          <ChevronLeft className="h-3.5 w-3.5 mr-1" />
          Anterior
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pagina >= paginasCalculadas}
          onClick={() => onCambiarPagina(pagina + 1)}
          className="h-8 px-2.5 text-xs text-neutral-300 disabled:opacity-40"
          aria-label="Página siguiente"
        >
          Siguiente
          <ChevronRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </div>
    </div>
  );
}
