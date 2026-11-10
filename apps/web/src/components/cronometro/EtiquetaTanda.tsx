import { Layers } from 'lucide-react';
import type { MiTrabajoTarea } from '@afull/shared';

const m2 = (n: number) => String(n).replace('.', ',');

/** En la tarjeta de la tarea principal: entre qué OTs se reparte el tiempo de la tanda (Loop 12). */
export function EtiquetaTanda({ tarea }: { tarea: MiTrabajoTarea }) {
  if (!tarea.tanda) return null;
  return (
    <div className="mb-2 rounded border border-sky-800/60 bg-sky-950/30 px-2.5 py-2 text-[11px] text-sky-200">
      <p className="mb-1 flex items-center gap-1.5 font-semibold"><Layers className="h-3.5 w-3.5" />Tanda compartida</p>
      <ul className="space-y-0.5">
        {tarea.tanda.tareas.map((x) => <li key={x.tarea_id}>{`${x.codigo_ot} · ${x.cliente_nombre} (${m2(x.m2)} m²)`}</li>)}
      </ul>
    </div>
  );
}
