import { useState } from 'react';
import { MiTrabajoPage } from './mi-trabajo.js';
import { TerminadasMiTrabajo } from '../components/cronometro/TerminadasMiTrabajo.js';

const PESTANAS = [{ id: 'pendientes', texto: 'Pendientes' }, { id: 'terminadas', texto: 'Terminadas' }] as const;

/** Loop 15: Mi trabajo con dos pestañas: lo de hoy y lo que ya terminé. */
export function MiTrabajoConPestanas() {
  const [actual, setActual] = useState<(typeof PESTANAS)[number]['id']>('pendientes');
  return (
    <div>
      <div role="tablist" aria-label="Mi trabajo" className="flex gap-1 border-b border-[#1f2937] px-4 pt-3">
        {PESTANAS.map((p) => (
          <button key={p.id} role="tab" type="button" aria-selected={actual === p.id} onClick={() => setActual(p.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${actual === p.id ? 'border-[#ea580c] text-white' : 'border-transparent text-neutral-400'}`}>
            {p.texto}
          </button>
        ))}
      </div>
      {actual === 'pendientes' ? <MiTrabajoPage /> : <div className="p-4"><TerminadasMiTrabajo /></div>}
    </div>
  );
}
