import { useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import type { AreaProceso } from '@afull/shared';
import { crearProceso, editarProceso } from '../lib/api-procesos.js';
import { mensajeDeError } from '../lib/api.js';
import { AREAS, useProcesos } from '../components/procesos/procesos.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';

const selectCls = 'h-9 rounded-md border border-[#1f2937] bg-[#111318] px-2 text-sm text-neutral-100';

/** Catálogo de procesos (solo admin): agregar los que hagan falta y desactivar los que no se usan. Nada se borra. */
export function ProcesosPage() {
  const qc = useQueryClient();
  const { data = [] } = useProcesos();
  const [nombre, setNombre] = useState('');
  const [area, setArea] = useState<AreaProceso>('TERMINACIONES');
  const [conMedidas, setConMedidas] = useState(false);

  const hacer = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      void qc.invalidateQueries({ queryKey: ['procesos'] });
    } catch (e) {
      toast.error(mensajeDeError(e, 'No se pudo guardar'));
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">Procesos</h1>
        <p className="text-xs text-neutral-400">Los tipos de tarea de cada área que se asignan en las OTs y se cronometran. Uno en desuso se desactiva: sus horas viejas no se pierden.</p>
      </div>
      <form className="flex flex-wrap gap-2 rounded-md border border-[#1f2937] bg-[#111318] p-4" onSubmit={(e) => {
        e.preventDefault();
        if (nombre.trim().length >= 2) void hacer(() => crearProceso({ nombre: nombre.trim(), area, conMedidas }), `Proceso "${nombre.trim()}" agregado.`).then(() => { setNombre(''); setConMedidas(false); });
      }}>
        <Input aria-label="Nombre del proceso" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Laminado" className="max-w-xs" />
        <select aria-label="Área" className={selectCls} value={area} onChange={(e) => setArea(e.target.value as AreaProceso)}>
          {(Object.keys(AREAS) as AreaProceso[]).map((a) => <option key={a} value={a}>{AREAS[a]}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-neutral-300">
          <input type="checkbox" checked={conMedidas} onChange={(e) => setConMedidas(e.target.checked)} /> Medidas en cm
        </label>
        <Button type="submit" disabled={nombre.trim().length < 2}>Agregar proceso</Button>
      </form>
      <p className="text-[11px] text-neutral-500">"Medidas en cm": la tarea tiene el botón Medidas (calcula el desperdicio) y se puede juntar en una tanda para varios clientes.</p>
      {(Object.keys(AREAS) as AreaProceso[]).filter((a) => data.some((p) => p.area === a)).map((a) => (
        <section key={a} aria-label={AREAS[a]} className="rounded-md border border-[#1f2937] bg-[#111318] text-xs">
          <h2 className="border-b border-[#1f2937] px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">{AREAS[a]}</h2>
          {data.filter((p) => p.area === a).map((p) => (
            <div key={p.codigo} className="flex items-center justify-between gap-2 border-b border-[#1f2937] px-4 py-2 last:border-0">
              <span className={p.activo ? 'text-white' : 'text-neutral-500 line-through'}>{p.nombre}</span>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" aria-pressed={p.con_medidas} className={`h-7 text-xs ${p.con_medidas ? 'text-sky-300' : 'text-neutral-500'}`}
                  onClick={() => void hacer(() => editarProceso(p.codigo, { conMedidas: !p.con_medidas }), p.con_medidas ? `${p.nombre}: sin medidas.` : `${p.nombre}: con medidas en cm.`)}>
                  {p.con_medidas ? 'Con medidas en cm' : 'Sin medidas'}
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void hacer(() => editarProceso(p.codigo, { activo: !p.activo }), p.activo ? 'Proceso desactivado.' : 'Proceso reactivado.')}>
                  {p.activo ? 'Desactivar' : 'Reactivar'}
                </Button>
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
