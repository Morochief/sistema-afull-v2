import { useState } from 'react';
import { Package, Ruler, Layers } from 'lucide-react';
import type { MiTrabajoTarea } from '@afull/shared';
import { Button } from '../ui/button.js';
import { ModalCargarMaterial } from './ModalCargarMaterial.js';
import { ModalMerma } from './ModalMerma.js';
import { ModalCompartido } from './ModalCompartido.js';

/** Procesos donde tiene sentido calcular merma por medidas (impresión, ploteo, corte, refilado). */
const CON_MERMA = new Set(['TALLER_IMPRESION', 'PLOTEO', 'TALLER_CORTE', 'REFILADO']);

/** Botones de material en cada tarjeta de "Mi trabajo". */
export function AccionesMaterial({ tarea }: { tarea: MiTrabajoTarea }) {
  const [modal, setModal] = useState<'material' | 'merma' | 'compartido' | null>(null);
  const merma = CON_MERMA.has(tarea.tipo);
  return (
    <>
      <div className={`mt-2 grid gap-2 ${merma ? 'grid-cols-3' : 'grid-cols-1'}`}>
        <Button size="sm" variant="outline" className="h-9 gap-1 text-xs" onClick={() => setModal('material')}><Package className="h-3.5 w-3.5" /> Material</Button>
        {merma && <Button size="sm" variant="outline" className="h-9 gap-1 text-xs" onClick={() => setModal('merma')}><Ruler className="h-3.5 w-3.5" /> Merma</Button>}
        {merma && <Button size="sm" variant="outline" className="h-9 gap-1 text-xs" onClick={() => setModal('compartido')}><Layers className="h-3.5 w-3.5" /> Compartido</Button>}
      </div>
      {modal === 'material' && <ModalCargarMaterial otId={tarea.orden_trabajo_id} tareaId={tarea.id} titulo={`${tarea.codigo_ot} · ${tarea.descripcion}`} onCerrar={() => setModal(null)} />}
      {modal === 'merma' && <ModalMerma otId={tarea.orden_trabajo_id} tareaId={tarea.id} onCerrar={() => setModal(null)} />}
      {modal === 'compartido' && <ModalCompartido onCerrar={() => setModal(null)} />}
    </>
  );
}
