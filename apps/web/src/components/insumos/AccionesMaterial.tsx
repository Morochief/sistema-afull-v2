import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Package, Ruler, Layers, Timer } from 'lucide-react';
import { TIPOS_CON_MERMA, type MiTrabajoTarea } from '@afull/shared';
import { obtenerMiTrabajo } from '../../lib/api-cronometro.js';
import { ModalTanda } from '../cronometro/ModalTanda.js';
import { Button } from '../ui/button.js';
import { ModalCargarMaterial } from './ModalCargarMaterial.js';
import { ModalMerma } from './ModalMerma.js';
import { ModalCompartido } from './ModalCompartido.js';

/** Procesos donde tiene sentido calcular merma por medidas (impresión, ploteo, corte, refilado). */
const CON_MERMA = new Set<string>(TIPOS_CON_MERMA);

/** Botones de material en cada tarjeta de "Mi trabajo". */
export function AccionesMaterial({ tarea }: { tarea: MiTrabajoTarea }) {
  const [modal, setModal] = useState<'material' | 'merma' | 'compartido' | 'tanda' | null>(null);
  const merma = CON_MERMA.has(tarea.tipo);
  // Loop 12: una tanda se arma desde una tarea de máquina que todavía no corre ni está en otra tanda.
  const puedeTanda = merma && tarea.estado !== 'EN_CURSO' && !tarea.tanda;
  const { data } = useQuery({ queryKey: ['mi-trabajo'], queryFn: obtenerMiTrabajo, enabled: modal === 'tanda' });
  return (
    <>
      <div className={`mt-2 grid gap-2 ${merma ? 'grid-cols-3' : 'grid-cols-1'}`}>
        <Button size="sm" variant="outline" className="h-9 gap-1 text-xs" onClick={() => setModal('material')}><Package className="h-3.5 w-3.5" /> Material</Button>
        {merma && <Button size="sm" variant="outline" className="h-9 gap-1 text-xs" onClick={() => setModal('merma')}><Ruler className="h-3.5 w-3.5" /> Merma</Button>}
        {merma && <Button size="sm" variant="outline" className="h-9 gap-1 text-xs" onClick={() => setModal('compartido')}><Layers className="h-3.5 w-3.5" /> Compartido</Button>}
      </div>
      {puedeTanda && (
        <Button size="sm" variant="outline" className="mt-2 h-9 w-full gap-1 border-sky-800 text-xs text-sky-300" onClick={() => setModal('tanda')}>
          <Timer className="h-3.5 w-3.5" /> Tanda para varios clientes
        </Button>
      )}
      {modal === 'tanda' && <ModalTanda origen={tarea} tareas={data?.tareas ?? []} onCerrar={() => setModal(null)} />}
      {modal === 'material' && <ModalCargarMaterial otId={tarea.orden_trabajo_id} tareaId={tarea.id} titulo={`${tarea.codigo_ot} · ${tarea.descripcion}`} onCerrar={() => setModal(null)} />}
      {modal === 'merma' && <ModalMerma otId={tarea.orden_trabajo_id} tareaId={tarea.id} onCerrar={() => setModal(null)} />}
      {modal === 'compartido' && <ModalCompartido onCerrar={() => setModal(null)} />}
    </>
  );
}
