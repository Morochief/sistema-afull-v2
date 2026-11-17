import { AlertTriangle, Plus } from 'lucide-react';
import type { PanelEnPausa, PanelSinTarea, PanelTrabajando } from '@afull/shared';
import { hace, horaCorta, motivoPausa } from '../../lib/api-panel.js';

type Persona = { persona_id: string; nombre: string };
const caja = 'rounded border border-[#1f2937] bg-[#111318] p-3 text-xs';

function BotonAsignar({ p, onAsignar }: { p: Persona; onAsignar: (p: Persona) => void }) {
  return (
    <button type="button" onClick={() => onAsignar(p)} aria-label={`Asignar tarea a ${p.nombre}`}
      className="mt-2 inline-flex h-8 items-center gap-1 rounded border border-[#ea580c] px-2 font-semibold text-[#ea580c] hover:bg-[#ea580c]/10">
      <Plus className="h-3.5 w-3.5" /> Asignar tarea
    </button>
  );
}

export function TarjetaTrabajando({ p, segundos, onAsignar }: { p: PanelTrabajando; segundos: number; onAsignar: (p: Persona) => void }) {
  return (
    <li className={caja} data-testid={`trabajando-${p.persona_id}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-white">{p.nombre}</span>
        <span className="font-mono text-[#22c55e]">{hace(segundos)}</span>
      </div>
      <p className="mt-1 text-neutral-300">{p.tarea_descripcion}</p>
      <p className="text-neutral-500"><span className="text-[#ea580c]">{p.ot_codigo}</span> · {p.cliente_nombre}</p>
      {p.salio && (
        <p className="mt-1 flex items-center gap-1 text-amber-400"><AlertTriangle className="h-3.5 w-3.5" /> Marcó salida: ¿se olvidó de pausar?</p>
      )}
      <BotonAsignar p={p} onAsignar={onAsignar} />
    </li>
  );
}

export function TarjetaPausa({ p, onAsignar }: { p: PanelEnPausa; onAsignar: (p: Persona) => void }) {
  return (
    <li className={caja} data-testid={`pausa-${p.persona_id}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-white">{p.nombre}</span>
        <span className="text-amber-400">{motivoPausa(p.motivo)} · desde {horaCorta(p.desde)}</span>
      </div>
      <p className="mt-1 text-neutral-300">{p.tarea_descripcion}</p>
      <p className="text-neutral-500"><span className="text-[#ea580c]">{p.ot_codigo}</span> · {p.cliente_nombre}</p>
      <BotonAsignar p={p} onAsignar={onAsignar} />
    </li>
  );
}

export function TarjetaSinTarea({ p, onAsignar }: { p: PanelSinTarea; onAsignar: (p: Persona) => void }) {
  const nada = p.pendientes_hoy === 0;
  return (
    <li className={`${caja} ${nada ? 'border-[#ea580c]/60' : ''}`} data-testid={`sintarea-${p.persona_id}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-white">{p.nombre}</span>
        {p.marcada_at && <span className="text-neutral-500">entró {horaCorta(p.marcada_at)}</span>}
      </div>
      <p className={nada ? 'mt-1 font-semibold text-[#ea580c]' : 'mt-1 text-neutral-300'}>
        {nada ? 'No tiene nada para hoy' : `${p.pendientes_hoy} tarea${p.pendientes_hoy === 1 ? '' : 's'} para hoy sin empezar`}
      </p>
      <BotonAsignar p={p} onAsignar={onAsignar} />
    </li>
  );
}
