import React, { useState, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import type { FiltrosTabla } from './tipos.js';
import { Input } from '../ui/input.js';
import { cn } from '../../lib/utils.js';

export type BarraFiltrosProps = {
  filtros: FiltrosTabla;
  onFiltros: (cambio: Partial<FiltrosTabla>) => void;
  opcionesEstado: { valor: string; etiqueta: string }[];
  textoBusqueda: string;
  acciones?: React.ReactNode;
};

export function BarraFiltros({
  filtros,
  onFiltros,
  opcionesEstado,
  textoBusqueda,
  acciones,
}: BarraFiltrosProps) {
  const [texto, setTexto] = useState(filtros.q || '');
  const valorAnteriorRef = useRef(filtros.q || '');

  // Sincronizar estado local si filtros.q cambia externamente (ej: botón limpiar)
  useEffect(() => {
    const qActual = filtros.q || '';
    if (qActual !== valorAnteriorRef.current) {
      valorAnteriorRef.current = qActual;
      setTexto(qActual);
    }
  }, [filtros.q]);

  // Debounce de 300 ms en búsqueda
  useEffect(() => {
    if (texto === valorAnteriorRef.current) return;

    const timer = setTimeout(() => {
      valorAnteriorRef.current = texto;
      onFiltros({ q: texto.trim() || undefined, pagina: 1 });
    }, 300);

    return () => clearTimeout(timer);
  }, [texto, onFiltros]);

  const handleEstadoChange = (valor: string) => {
    if (valor === (filtros.estado || 'todos')) return;
    onFiltros({ estado: valor, pagina: 1 });
  };

  const handleDesdeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valor = e.target.value || undefined;
    if (valor === filtros.desde) return;
    onFiltros({ desde: valor, pagina: 1 });
  };

  const handleHastaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valor = e.target.value || undefined;
    if (valor === filtros.hasta) return;
    onFiltros({ hasta: valor, pagina: 1 });
  };

  const estadoSeleccionado = filtros.estado || 'todos';

  return (
    <div className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#1f2937]">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-neutral-500 pointer-events-none" />
          <Input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={textoBusqueda}
            className="pl-8 h-9 text-xs"
            aria-label="Buscar en la tabla"
          />
        </div>

        {opcionesEstado.length > 0 && (
          <div className="inline-flex rounded-md border border-[#1f2937] bg-[#111318] p-0.5" role="group" aria-label="Filtro de estado">
            {opcionesEstado.map((opcion) => {
              const activo = estadoSeleccionado === opcion.valor;
              return (
                <button
                  key={opcion.valor}
                  type="button"
                  onClick={() => handleEstadoChange(opcion.valor)}
                  className={cn(
                    'rounded px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer',
                    activo
                      ? 'bg-[#ea580c] text-white shadow-xs'
                      : 'text-neutral-400 hover:text-neutral-200 hover:bg-[#1f2937]'
                  )}
                  aria-pressed={activo}
                >
                  {opcion.etiqueta}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-1.5 text-xs text-neutral-400">
          <label htmlFor="filtro-desde" className="sr-only">Desde fecha</label>
          <input
            id="filtro-desde"
            type="date"
            value={filtros.desde || ''}
            onChange={handleDesdeChange}
            aria-label="Desde fecha"
            className="h-9 rounded-md border border-[#1f2937] bg-[#111318] px-2 py-1 text-xs text-neutral-200 transition-colors focus:border-[#ea580c] focus:outline-none focus:ring-1 focus:ring-[#ea580c]"
          />
          <span className="text-neutral-500">-</span>
          <label htmlFor="filtro-hasta" className="sr-only">Hasta fecha</label>
          <input
            id="filtro-hasta"
            type="date"
            value={filtros.hasta || ''}
            onChange={handleHastaChange}
            aria-label="Hasta fecha"
            className="h-9 rounded-md border border-[#1f2937] bg-[#111318] px-2 py-1 text-xs text-neutral-200 transition-colors focus:border-[#ea580c] focus:outline-none focus:ring-1 focus:ring-[#ea580c]"
          />
        </div>
      </div>

      {acciones && <div className="flex items-center gap-2">{acciones}</div>}
    </div>
  );
}
