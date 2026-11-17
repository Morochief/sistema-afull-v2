import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useDebounce } from '../../hooks/useDebounce.js';
import { Input } from '../ui/input.js';
import { Label } from '../ui/label.js';

export type Opcion = { id: string; texto: string };

/** Buscador de un solo valor (cliente, proyecto o persona) con debounce de 300 ms. */
export function SelectorBuscar({ etiqueta, valor, onCambio, buscar }: {
  etiqueta: string; valor: Opcion | null; onCambio: (o: Opcion | null) => void; buscar: (q: string) => Promise<Opcion[]>;
}) {
  const [q, setQ] = useState('');
  const d = useDebounce(q, 300);
  const [opciones, setOpciones] = useState<Opcion[]>([]);
  useEffect(() => {
    if (!d.trim() || valor) return setOpciones([]);
    let vivo = true;
    buscar(d).then((o) => vivo && setOpciones(o)).catch(() => vivo && setOpciones([]));
    return () => { vivo = false; };
  }, [d, valor, buscar]);
  return (
    <div className="relative min-w-[180px]">
      <Label>{etiqueta}</Label>
      {valor ? (
        <div className="flex h-9 items-center justify-between gap-2 rounded border border-[#1f2937] bg-[#161922] px-2 text-xs">
          <span className="truncate text-white">{valor.texto}</span>
          <button type="button" aria-label={`Quitar ${etiqueta}`} onClick={() => onCambio(null)} className="text-neutral-400 hover:text-white"><X className="h-3.5 w-3.5" /></button>
        </div>
      ) : (
        <Input aria-label={etiqueta} placeholder="Todos" value={q} onChange={(e) => setQ(e.target.value)} />
      )}
      {opciones.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded border border-[#1f2937] bg-[#111318] text-xs shadow-lg">
          {opciones.map((o) => (
            <li key={o.id}><button type="button" className="w-full px-2 py-1.5 text-left hover:bg-[#1f2937]" onClick={() => { onCambio(o); setQ(''); }}>{o.texto}</button></li>
          ))}
        </ul>
      )}
    </div>
  );
}
