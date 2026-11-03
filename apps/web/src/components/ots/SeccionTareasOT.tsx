import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { obtenerTareasOT } from '../../lib/api-tareas.js';
import { ModalNuevaTareaOT } from '../modals/ModalNuevaTareaOT.js';
import { ModalReasignarTarea } from '../modals/ModalReasignarTarea.js';
import { ModalCancelarTarea } from '../modals/ModalCancelarTarea.js';
import { Button } from '../ui/button.js';
import { Badge } from '../ui/badge.js';
import { Plus, UserCheck, XCircle } from 'lucide-react';
import type { TareaFila, EstadoTarea } from '@afull/shared';

function badgeTarea(estado: EstadoTarea) {
  switch (estado) {
    case 'PENDIENTE':
      return <Badge variant="neutral">Pendiente</Badge>;
    case 'EN_CURSO':
      return <Badge variant="default" className="bg-[#ea580c] text-white">En Curso</Badge>;
    case 'PAUSADA':
      return <Badge variant="warning">Pausada</Badge>;
    case 'LISTO':
      return <Badge variant="success">Listo</Badge>;
    case 'CANCELADA':
      return <Badge variant="danger">Cancelada</Badge>;
  }
}

export function SeccionTareasOT({ otId, otFinalizada }: { otId: string; otFinalizada: boolean }) {
  const { data: tareas = [], refetch } = useQuery<TareaFila[]>({
    queryKey: ['tareas-ot', otId],
    queryFn: () => obtenerTareasOT(otId),
  });

  const [modalNueva, setModalNueva] = useState(false);
  const [tareaReasignar, setTareaReasignar] = useState<TareaFila | null>(null);
  const [tareaCancelar, setTareaCancelar] = useState<TareaFila | null>(null);

  return (
    <div className="rounded-md border border-[#1f2937] bg-[#111318] p-4 space-y-4">
      <div className="flex items-center justify-between border-b border-[#1f2937] pb-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Tareas de Producción ({tareas.length})
        </h2>
        {!otFinalizada && (
          <Button
            size="sm"
            onClick={() => setModalNueva(true)}
            className="h-7 text-xs gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Agregar Tarea</span>
          </Button>
        )}
      </div>

      {tareas.length === 0 ? (
        <p className="text-xs text-neutral-500 py-3 text-center">
          No hay tareas definidas en esta orden.
        </p>
      ) : (
        <div className="divide-y divide-[#1f2937]">
          {tareas.map((t) => {
            const final = t.estado === 'LISTO' || t.estado === 'CANCELADA';
            return (
              <div key={t.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {badgeTarea(t.estado)}
                    <span className="text-xs font-medium text-white">{t.descripcion}</span>
                    <span className="text-[11px] text-neutral-500 font-mono">({t.tipo})</span>
                  </div>
                  <div className="text-xs text-neutral-400 flex items-center gap-3">
                    <span>
                      Asignado:{' '}
                      <strong className="text-neutral-200">
                        {t.persona_asignada_nombre || 'Sin asignar'}
                      </strong>
                    </span>
                    <span>·</span>
                    <span>
                      Tiempo trabajado:{' '}
                      <strong className="text-[#ea580c]">{t.minutos_trabajados} min</strong>
                    </span>
                  </div>
                </div>

                {!otFinalizada && !final && (
                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setTareaReasignar(t)}
                      className="h-7 text-xs gap-1 border-[#1f2937]"
                    >
                      <UserCheck className="h-3 w-3" />
                      <span>Reasignar</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setTareaCancelar(t)}
                      className="h-7 text-xs gap-1 text-red-400 hover:text-red-300"
                    >
                      <XCircle className="h-3 w-3" />
                      <span>Cancelar</span>
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ModalNuevaTareaOT
        abierto={modalNueva}
        onCerrar={() => setModalNueva(false)}
        otId={otId}
        onCreada={() => void refetch()}
      />

      <ModalReasignarTarea
        tarea={tareaReasignar}
        onCerrar={() => setTareaReasignar(null)}
        onReasignada={() => void refetch()}
      />

      <ModalCancelarTarea
        tarea={tareaCancelar}
        onCerrar={() => setTareaCancelar(null)}
        onCancelada={() => void refetch()}
      />
    </div>
  );
}
