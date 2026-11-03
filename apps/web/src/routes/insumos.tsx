import { useState } from 'react';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UNIDADES_INSUMO, type UnidadInsumo } from '@afull/shared';
import { buscarInsumos, crearInsumo, editarInsumo, nuevoPrecioInsumo, UNIDAD_CORTA, type Insumo } from '../lib/api-insumos.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { numero } from '../lib/numero.js';
import { mensajeDeError } from '../lib/api.js';
import { formatearGs } from '../lib/formato.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';

const selectCls = 'h-9 rounded-md border border-[#1f2937] bg-[#111318] px-2 text-sm text-neutral-100';

/** Catálogo de insumos (solo admin). No es stock: es la lista de precios. Cambiar un precio no toca lo ya cargado. */
export function InsumosPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const d = useDebounce(q, 300);
  const { data = [] } = useQuery({ queryKey: ['insumos', 'admin', d], queryFn: () => buscarInsumos(d, true) });
  const [nombre, setNombre] = useState('');
  const [unidad, setUnidad] = useState<UnidadInsumo>('UNIDAD');
  const [sector, setSector] = useState('');
  const [costo, setCosto] = useState('');
  const [editando, setEditando] = useState<string | null>(null);
  const [precio, setPrecio] = useState('');

  const hacer = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      void qc.invalidateQueries({ queryKey: ['insumos'] });
      return true;
    } catch (e) {
      toast.error(mensajeDeError(e, 'No se pudo guardar'));
      return false;
    }
  };

  const alta = async (e: React.FormEvent) => {
    e.preventDefault();
    const c = numero(costo);
    if (nombre.trim().length < 2 || !(c >= 0) || costo.trim() === '') return toast.error('Nombre y costo son obligatorios');
    if (await hacer(() => crearInsumo({ nombre: nombre.trim(), unidad, sector: sector.trim() || undefined, costoUnitarioGs: c }), `Insumo "${nombre.trim()}" agregado.`)) {
      setNombre('');
      setCosto('');
    }
  };

  const guardarPrecio = async (i: Insumo) => {
    const c = numero(precio);
    if (!(c >= 0) || precio.trim() === '') return toast.error('Costo inválido');
    if (await hacer(() => nuevoPrecioInsumo(i.id, c), `Nuevo precio de ${i.nombre}: ${formatearGs(c)}.`)) setEditando(null);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">Insumos</h1>
        <p className="text-xs text-neutral-400">Lista de precios de materiales. Cada operario carga lo que usó en la OT; el costo de ese momento queda congelado.</p>
      </div>
      <form onSubmit={alta} className="flex flex-wrap gap-2 rounded-md border border-[#1f2937] bg-[#111318] p-4">
        <Input aria-label="Nombre del insumo" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Lona front 13 oz" className="max-w-xs" />
        <select aria-label="Unidad" className={selectCls} value={unidad} onChange={(e) => setUnidad(e.target.value as UnidadInsumo)}>
          {UNIDADES_INSUMO.map((u) => <option key={u} value={u}>{UNIDAD_CORTA[u]}</option>)}
        </select>
        <Input aria-label="Sector" value={sector} onChange={(e) => setSector(e.target.value)} placeholder="Sector (opcional)" className="max-w-[10rem]" />
        <Input aria-label="Costo unitario" inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="Costo Gs" className="max-w-[9rem]" />
        <Button type="submit">Agregar insumo</Button>
      </form>
      <Input aria-label="Buscar insumo" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="max-w-sm" />
      <div className="rounded-md border border-[#1f2937] bg-[#111318] text-xs">
        {data.length === 0 && <p className="px-4 py-3 text-neutral-500">Sin insumos.</p>}
        {data.map((i) => (
          <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1f2937] px-4 py-2 last:border-0">
            <span className={i.activo ? 'text-white' : 'text-neutral-500 line-through'}>
              {i.nombre} <span className="text-neutral-500">· {UNIDAD_CORTA[i.unidad]}{i.sector ? ` · ${i.sector}` : ''}</span>
            </span>
            <div className="flex items-center gap-2">
              {editando === i.id ? (
                <>
                  <Input aria-label={`Nuevo costo ${i.nombre}`} inputMode="decimal" className="h-7 w-28 text-xs" value={precio} onChange={(e) => setPrecio(e.target.value)} />
                  <Button size="sm" className="h-7 text-xs" onClick={() => void guardarPrecio(i)}>Guardar</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditando(null)}>×</Button>
                </>
              ) : (
                <button type="button" className="font-mono text-neutral-200 hover:text-[#ea580c]" title="Cargar precio nuevo" onClick={() => { setEditando(i.id); setPrecio(String(i.costo_unitario_gs ?? '')); }}>
                  {i.costo_unitario_gs === null ? '—' : formatearGs(i.costo_unitario_gs)}
                </button>
              )}
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void hacer(() => editarInsumo(i.id, { activo: !i.activo }), i.activo ? 'Insumo desactivado.' : 'Insumo reactivado.')}>
                {i.activo ? 'Desactivar' : 'Reactivar'}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
