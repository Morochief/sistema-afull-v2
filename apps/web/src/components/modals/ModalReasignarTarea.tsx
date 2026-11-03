import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { editarTarea } from '../../lib/api-tareas.js';
import { obtenerPersonasAsignables } from '../../lib/api-personas.js';
import { mensajeDeError } from '../../lib/api.js';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog.js';
import { Button } from '../ui/button.js';
import { Label } from '../ui/label.js';
import type { TareaFila, PersonaAsignable } from '@afull/shared';

type Props = {
  tarea: TareaFila | null;
  onCerrar: () => void;
  onReasignada: () => void;
};

export function ModalReasignarTarea({ tarea, onCerrar, onReasignada }: Props) {
  const [asignables, setAsignables] = useState<PersonaAsignable[]>([]);
  const [personaId, setPersonaId] = useState<string>('');
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!tarea) return;
    setPersonaId(tarea.persona_asignada_id || '');
    obtenerPersonasAsignables()
      .then(setAsignables)
      .catch(() => setAsignables([]));
  }, [tarea]);

  if (!tarea) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCargando(true);
    try {
      await editarTarea(tarea.id, {
        personaAsignadaId: personaId || null,
        updatedAt: tarea.updated_at,
      });
      toast.success('Tarea reasignada correctamente.');
      onReasignada();
      onCerrar();
    } catch (err) {
      toast.error(mensajeDeError(err, 'Error al reasignar tarea'));
    } finally {
      setCargando(false);
    }
  };

  return (
    <Dialog abierto={Boolean(tarea)} onCerrar={onCerrar}>
      <DialogHeader>
        <DialogTitle>Reasignar Operario</DialogTitle>
        <DialogDescription>
          Seleccione el nuevo colaborador responsable de la tarea.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label className="mb-1 block">Tarea</Label>
          <p className="text-xs text-neutral-300 font-medium bg-[#090a0f] p-2.5 rounded border border-[#1f2937]">
            {tarea.descripcion}
          </p>
        </div>

        <div>
          <Label htmlFor="personaId">Operario Asignado</Label>
          <select
            id="personaId"
            value={personaId}
            onChange={(e) => setPersonaId(e.target.value)}
            className="flex h-9 w-full rounded-md border border-[#1f2937] bg-[#161922] px-3 py-1 text-xs text-neutral-200 shadow-sm focus:border-[#ea580c]"
          >
            <option value="">(Sin asignar / Desasignar)</option>
            {asignables.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar} disabled={cargando}>
            Cancelar
          </Button>
          <Button type="submit" disabled={cargando}>
            {cargando ? 'Guardando...' : 'Guardar Asignación'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
