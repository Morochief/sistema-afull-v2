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
  const [area, setArea] = useState<AreaProceso>('TALLER');

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
        <p className="text-xs text-neutral-400">Los tipos de tarea que se asignan en las OTs y se cronometran. Uno en desuso se desactiva: sus horas viejas no se pierden.</p>
      </div>
      <form className="flex flex-wrap gap-2 rounded-md border border-[#1f2937] bg-[#111318] p-4" onSubmit={(e) => {
        e.preventDefault();
        if (nombre.trim().length >= 2) void hacer(() => crearProceso({ nombre: nombre.trim(), area }), `Proceso "${nombre.trim()}" agregado.`).then(() => setNombre(''));
      }}>
        <Input aria-label="Nombre del proceso" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Laminado" className="max-w-xs" />
        <select aria-label="Área" className={selectCls} value={area} onChange={(e) => setArea(e.target.value as AreaProceso)}>
          {(Object.keys(AREAS) as AreaProceso[]).map((a) => <option key={a} value={a}>{AREAS[a]}</option>)}
        </select>
        <Button type="submit" disabled={nombre.trim().length < 2}>Agregar proceso</Button>
      </form>
      <div className="rounded-md border border-[#1f2937] bg-[#111318] text-xs">
        {data.map((p) => (
          <div key={p.codigo} className="flex items-center justify-between border-b border-[#1f2937] px-4 py-2 last:border-0">
            <span className={p.activo ? 'text-white' : 'text-neutral-500 line-through'}>
              {p.nombre} <span className="text-neutral-500">· {AREAS[p.area]}</span>
            </span>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void hacer(() => editarProceso(p.codigo, { activo: !p.activo }), p.activo ? 'Proceso desactivado.' : 'Proceso reactivado.')}>
              {p.activo ? 'Desactivar' : 'Reactivar'}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
