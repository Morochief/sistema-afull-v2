import { useState, useEffect } from 'react';
import { obtenerClientes } from '../../lib/api-clientes.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { Input } from '../ui/input.js';
import { Label } from '../ui/label.js';
import type { ClienteFila } from '@afull/shared';

type Props = {
  clienteSeleccionado: ClienteFila | null;
  onSeleccionar: (cliente: ClienteFila) => void;
  onDeseleccionar: () => void;
  error?: string;
};

export function SelectorClienteOT({
  clienteSeleccionado,
  onSeleccionar,
  onDeseleccionar,
  error,
}: Props) {
  const [busqueda, setBusqueda] = useState('');
  const debounced = useDebounce(busqueda, 300);
  const [encontrados, setEncontrados] = useState<ClienteFila[]>([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!debounced.trim() || clienteSeleccionado) {
      setEncontrados([]);
      return;
    }
    setCargando(true);
    obtenerClientes({ q: debounced, estado: 'activos', pagina: 1 })
      .then((res) => setEncontrados(res.items))
      .catch(() => setEncontrados([]))
      .finally(() => setCargando(false));
  }, [debounced, clienteSeleccionado]);

  return (
    <div>
      <Label>
        Cliente <span className="text-[#ea580c]">*</span>
      </Label>
      {clienteSeleccionado ? (
        <div className="flex items-center justify-between rounded border border-[#1f2937] bg-[#161922] p-2 text-xs">
          <span className="font-semibold text-white">
            {clienteSeleccionado.nombre} ({clienteSeleccionado.codigo})
          </span>
          <button
            type="button"
            onClick={onDeseleccionar}
            className="text-xs text-[#ea580c] hover:underline"
          >
            Cambiar
          </button>
        </div>
      ) : (
        <div className="relative">
          <Input
            placeholder="Buscar cliente por nombre o RUC..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            autoFocus
          />
          {cargando && (
            <span className="absolute right-3 top-2.5 text-xs text-neutral-400">Buscando...</span>
          )}
          {encontrados.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded border border-[#1f2937] bg-[#111318] shadow-lg">
              {encontrados.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onSeleccionar(c);
                    setBusqueda('');
                    setEncontrados([]);
                  }}
                  className="w-full px-3 py-2 text-left text-xs text-neutral-200 hover:bg-[#1f2937] hover:text-white"
                >
                  <span className="font-medium">{c.nombre}</span>{' '}
                  <span className="text-neutral-400">({c.codigo})</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
