import { useState } from 'react';
import { toast } from 'sonner';
import { cancelarTarea } from '../../lib/api-tareas.js';
import { mensajeDeError } from '../../lib/api.js';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';
import { Label } from '../ui/label.js';
import type { TareaFila } from '@afull/shared';

type Props = {
  tarea: TareaFila | null;
  onCerrar: () => void;
  onCancelada: () => void;
};

export function ModalCancelarTarea({ tarea, onCerrar, onCancelada }: Props) {
  const [comentario, setComentario] = useState('');
  const [cargando, setCargando] = useState(false);
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);

  if (!tarea) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comentario.trim()) {
      setErrorValidacion('El motivo de cancelación es obligatorio.');
      return;
    }
    setErrorValidacion(null);
    setCargando(true);
    try {
      await cancelarTarea(tarea.id, {
        desde: tarea.estado,
        comentario: comentario.trim(),
      });
      toast.success('Tarea cancelada exitosamente.');
      setComentario('');
      onCancelada();
      onCerrar();
    } catch (err) {
      toast.error(mensajeDeError(err, 'Error al cancelar tarea'));
    } finally {
      setCargando(false);
    }
  };

  return (
    <Dialog abierto={Boolean(tarea)} onCerrar={onCerrar}>
      <DialogHeader>
        <DialogTitle className="text-red-400">Cancelar Tarea</DialogTitle>
        <DialogDescription>
          Esta acción cancelará definitivamente la tarea. Debe justificar el motivo.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label className="mb-1 block">Tarea a Cancelar</Label>
          <p className="text-xs text-neutral-300 font-medium bg-[#090a0f] p-2.5 rounded border border-[#1f2937]">
            {tarea.descripcion} ({tarea.estado})
          </p>
        </div>

        <div>
          <Label htmlFor="motivoCancelacion">
            Motivo de Cancelación <span className="text-red-400">*</span>
          </Label>
          <Input
            id="motivoCancelacion"
            value={comentario}
            onChange={(e) => {
              setComentario(e.target.value);
              if (errorValidacion) setErrorValidacion(null);
            }}
            placeholder="Ej: Cambio en diseño del cliente..."
            error={errorValidacion || undefined}
            autoFocus
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar} disabled={cargando}>
            Volver
          </Button>
          <Button
            type="submit"
            disabled={cargando}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {cargando ? 'Cancelando...' : 'Confirmar Cancelación'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
