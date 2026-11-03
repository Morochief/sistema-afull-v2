import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { buscarInsumos, UNIDAD_CORTA, type Insumo } from '../../lib/api-insumos.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { formatearGs } from '../../lib/formato.js';
import { Input } from '../ui/input.js';

/** Para operarios la API manda el costo en null: solo se muestra la unidad. */
const precio = (i: Insumo) => (i.costo_unitario_gs === null ? '' : `${formatearGs(i.costo_unitario_gs)} / `);

type Props = { valor: Insumo | null; onElegir: (i: Insumo | null) => void; placeholder?: string; id?: string };

/** Buscador del catálogo de insumos (debounce 300 ms, hasta 50 resultados; precio vigente solo para admin y comercial). */
export function BuscadorInsumo({ valor, onElegir, placeholder = 'Buscar material…', id }: Props) {
  const [q, setQ] = useState('');
  const d = useDebounce(q, 300);
  const { data = [], isFetching } = useQuery({ queryKey: ['insumos', d], queryFn: () => buscarInsumos(d), enabled: !valor && d.trim().length > 1 });

  if (valor) {
    return (
      <div className="flex items-center justify-between rounded border border-[#1f2937] bg-[#161922] p-2 text-xs">
        <span className="text-white">{valor.nombre} <span className="text-neutral-400">· {precio(valor)}{UNIDAD_CORTA[valor.unidad]}</span></span>
        <button type="button" className="text-[#ea580c] hover:underline" onClick={() => onElegir(null)}>Cambiar</button>
      </div>
    );
  }
  return (
    <div>
      <Input id={id} value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} autoComplete="off" />
      {d.trim().length > 1 && (
        <div className="mt-1 max-h-48 overflow-y-auto rounded border border-[#1f2937] bg-[#111318] text-xs">
          {isFetching && <p className="p-2 text-neutral-500">Buscando…</p>}
          {!isFetching && data.length === 0 && <p className="p-2 text-neutral-500">Sin resultados.</p>}
          {data.map((i) => (
            <button key={i.id} type="button" className="block w-full px-2 py-1.5 text-left hover:bg-[#161922]" onClick={() => { onElegir(i); setQ(''); }}>
              <span className="text-white">{i.nombre}</span> <span className="text-neutral-400">· {precio(i)}{UNIDAD_CORTA[i.unidad]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
