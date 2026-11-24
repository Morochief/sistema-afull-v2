import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Package, Ruler, Timer } from 'lucide-react';
import type { MiTrabajoTarea } from '@afull/shared';
import { obtenerMiTrabajo } from '../../lib/api-cronometro.js';
import { ModalTanda } from '../cronometro/ModalTanda.js';
import { Button } from '../ui/button.js';
import { ModalCargarMaterial } from './ModalCargarMaterial.js';
import { ModalCorte } from './ModalCorte.js';


/** Botones de material en cada tarjeta de "Mi trabajo". */
export function AccionesMaterial({ tarea }: { tarea: MiTrabajoTarea }) {
  const [modal, setModal] = useState<'material' | 'medidas' | 'tanda' | null>(null);
  // Procesos con medidas en cm (Loop 18) y tanda (Loop 12): lo marca el proceso (Loop 22).
  const merma = tarea.con_medidas === true;
  // Loop 12: una tanda se arma desde una tarea de máquina que todavía no corre ni está en otra tanda.
  const puedeTanda = merma && tarea.estado !== 'EN_CURSO' && !tarea.tanda;
  const { data } = useQuery({ queryKey: ['mi-trabajo'], queryFn: obtenerMiTrabajo, enabled: modal === 'tanda' || modal === 'medidas' });
  return (
    <>
      <div className={`mt-2 grid gap-2 ${merma ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <Button size="sm" variant="outline" className="h-9 gap-1 text-xs" onClick={() => setModal('material')}><Package className="h-3.5 w-3.5" /> Material</Button>
        {merma && <Button size="sm" variant="outline" className="h-9 gap-1 text-xs" onClick={() => setModal('medidas')}><Ruler className="h-3.5 w-3.5" /> Medidas (cm)</Button>}
      </div>
      {puedeTanda && (
        <Button size="sm" variant="outline" className="mt-2 h-9 w-full gap-1 border-sky-800 text-xs text-sky-300" onClick={() => setModal('tanda')}>
          <Timer className="h-3.5 w-3.5" /> Tanda para varios clientes
        </Button>
      )}
      {modal === 'tanda' && <ModalTanda origen={tarea} tareas={data?.tareas ?? []} onCerrar={() => setModal(null)} />}
      {modal === 'material' && <ModalCargarMaterial otId={tarea.orden_trabajo_id} tareaId={tarea.id} titulo={`${tarea.codigo_ot} · ${tarea.descripcion}`} onCerrar={() => setModal(null)} />}
      {modal === 'medidas' && <ModalCorte origen={tarea} tareas={data?.tareas ?? []} onCerrar={() => setModal(null)} />}
    </>
  );
}
