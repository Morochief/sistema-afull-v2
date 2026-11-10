import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pencil, UserCheck, XCircle } from 'lucide-react';
import type { TareaFila, EstadoTarea } from '@afull/shared';
import { obtenerTareasOT, type EstadoHoja } from '../../lib/api-tareas.js';
import { agruparPorOperario, resumenPlan } from '../../lib/plan-tarea.js';
import { ModalTareaHoja } from './ModalTareaHoja.js';
import { ModalReasignarTarea } from '../modals/ModalReasignarTarea.js';
import { ModalCancelarTarea } from '../modals/ModalCancelarTarea.js';
import { MuestrasTarea } from './MuestrasTarea.js';
import { HojaRutaCabecera } from './HojaRutaCabecera.js';
import { Button } from '../ui/button.js';
import { Badge } from '../ui/badge.js';

const ESTADO_TAREA: Record<EstadoTarea, { texto: string; variant: 'neutral' | 'default' | 'warning' | 'success' | 'danger' }> = {
  PENDIENTE: { texto: 'Pendiente', variant: 'neutral' }, EN_CURSO: { texto: 'En curso', variant: 'default' },
  PAUSADA: { texto: 'Pausada', variant: 'warning' }, LISTO: { texto: 'Listo', variant: 'success' }, CANCELADA: { texto: 'Cancelada', variant: 'danger' },
};

type Props = { ot: { id: string; hoja_estado: EstadoHoja; hoja_notas: string | null }; otFinalizada: boolean; onCambioOT: () => void };

/** La Hoja de ruta de la OT (Loop 11): tareas por operario con día, cantidad y tiempo; Borrador → Activa → Cerrada; WhatsApp. */
export function SeccionHojaRuta({ ot, otFinalizada, onCambioOT }: Props) {
  const { data: tareas = [], refetch } = useQuery<TareaFila[]>({ queryKey: ['tareas-ot', ot.id], queryFn: () => obtenerTareasOT(ot.id) });
  const [modal, setModal] = useState<{ tarea: TareaFila | null } | null>(null);
  const [reasignar, setReasignar] = useState<TareaFila | null>(null);
  const [cancelar, setCancelar] = useState<TareaFila | null>(null);
  const editable = !otFinalizada;
  const editableTareas = editable && ot.hoja_estado !== 'CERRADA';
  const cambio = () => { void refetch(); onCambioOT(); };

  return (
    <div className="space-y-4 rounded-md border border-[#1f2937] bg-[#111318] p-4" data-testid="hoja-ruta-ot">
      <HojaRutaCabecera otId={ot.id} estado={ot.hoja_estado} notas={ot.hoja_notas} editable={editable} cantidad={tareas.length}
        onCambio={cambio} onAgregar={() => setModal({ tarea: null })} />
      {tareas.length === 0 ? (
        <p className="py-3 text-center text-xs text-neutral-500">Todavía no hay tareas. Agregá una por cada cosa que tiene que hacer cada operario.</p>
      ) : (
        agruparPorOperario(tareas).map((g) => (
          <div key={g.nombre} className="space-y-1">
            <h3 className="text-xs font-bold text-[#ea580c]">⛔ {g.nombre}</h3>
            <div className="divide-y divide-[#1f2937] rounded border border-[#1f2937]">
              {g.items.map((t) => {
                const final = t.estado === 'LISTO' || t.estado === 'CANCELADA';
                const e = ESTADO_TAREA[t.estado];
                const plan = resumenPlan(t);
                return (
                  <div key={t.id} className="flex flex-col justify-between gap-2 px-3 py-2 sm:flex-row sm:items-center">
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={e.variant}>{e.texto}</Badge>
                        <span className={`whitespace-pre-wrap text-xs font-medium ${final ? 'text-neutral-500 line-through' : 'text-white'}`}>{t.descripcion}</span>
                      </div>
                      <div className="text-[11px] text-neutral-400">
                        {plan && <span className="mr-2 text-neutral-200">{plan}</span>}
                        Trabajado: <strong className="text-[#ea580c]">{t.minutos_trabajados} min</strong>
                      </div>
                      <MuestrasTarea tareaId={t.id} descripcion={t.descripcion} puedeSubir={t.estado !== 'CANCELADA'} />
                    </div>
                    {editableTareas && !final && (
                      <div className="flex gap-1 self-end sm:self-center">
                        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setModal({ tarea: t })}><Pencil className="h-3 w-3" /> Editar</Button>
                        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setReasignar(t)}><UserCheck className="h-3 w-3" /> Reasignar</Button>
                        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-red-400" onClick={() => setCancelar(t)}><XCircle className="h-3 w-3" /> Cancelar</Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
      <ModalTareaHoja otId={ot.id} tarea={modal?.tarea} abierto={!!modal} onCerrar={() => setModal(null)} onGuardada={cambio} />
      <ModalReasignarTarea tarea={reasignar} onCerrar={() => setReasignar(null)} onReasignada={cambio} />
      <ModalCancelarTarea tarea={cancelar} onCerrar={() => setCancelar(null)} onCancelada={cambio} />
    </div>
  );
}
