import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { resolverSinVacios } from '../../lib/formulario.js';
import { toast } from 'sonner';
import { nuevaTareaSchema, TIPOS_TAREA, type TipoTarea, type PersonaAsignable } from '@afull/shared';
import { crearTareaOT, type NuevaTarea } from '../../lib/api-tareas.js';
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
import { Input } from '../ui/input.js';
import { Label } from '../ui/label.js';

type Props = {
  abierto: boolean;
  onCerrar: () => void;
  otId: string;
  onCreada: () => void;
};

const ETIQUETAS_TIPO: Record<TipoTarea, string> = {
  DISENO: 'Diseño',
  TALLER_IMPRESION: 'Impresión',
  TALLER_CORTE: 'Corte',
  TALLER_HERRERIA: 'Herrería',
  TALLER_ARMADO: 'Armado',
  MONTAJE_CALLE: 'Montaje en Calle',
  OTRO: 'Otro',
};

export function ModalNuevaTareaOT({ abierto, onCerrar, otId, onCreada }: Props) {
  const [asignables, setAsignables] = useState<PersonaAsignable[]>([]);
  const [cargando, setCargando] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<NuevaTarea>({
    resolver: resolverSinVacios(nuevaTareaSchema),
    defaultValues: {
      tipo: 'TALLER_ARMADO',
      descripcion: '',
      personaAsignadaId: undefined,
    },
  });

  useEffect(() => {
    if (!abierto) return;
    obtenerPersonasAsignables()
      .then(setAsignables)
      .catch(() => setAsignables([]));
  }, [abierto]);

  const onSubmit = async (datos: NuevaTarea) => {
    setCargando(true);
    try {
      await crearTareaOT(otId, {
        tipo: datos.tipo,
        descripcion: datos.descripcion.trim(),
        personaAsignadaId: datos.personaAsignadaId || undefined,
      });
      toast.success('Tarea agregada exitosamente.');
      reset();
      onCreada();
      onCerrar();
    } catch (err) {
      toast.error(mensajeDeError(err, 'Error al agregar tarea'));
    } finally {
      setCargando(false);
    }
  };

  return (
    <Dialog abierto={abierto} onCerrar={onCerrar}>
      <DialogHeader>
        <DialogTitle>Agregar Tarea a la OT</DialogTitle>
        <DialogDescription>
          Defina una nueva tarea de producción o montaje para esta orden de trabajo.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
        <div>
          <Label htmlFor="tipo">Tipo de Tarea *</Label>
          <select
            id="tipo"
            {...register('tipo')}
            className="flex h-9 w-full rounded-md border border-[#1f2937] bg-[#161922] px-3 py-1 text-xs text-neutral-200 shadow-sm focus:border-[#ea580c]"
          >
            {TIPOS_TAREA.map((tipo) => (
              <option key={tipo} value={tipo}>
                {ETIQUETAS_TIPO[tipo]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="personaAsignadaId">Operario Asignado (opcional)</Label>
          <select
            id="personaAsignadaId"
            {...register('personaAsignadaId')}
            className="flex h-9 w-full rounded-md border border-[#1f2937] bg-[#161922] px-3 py-1 text-xs text-neutral-200 shadow-sm focus:border-[#ea580c]"
          >
            <option value="">(Sin asignar)</option>
            {asignables.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="descripcion">Descripción de la Tarea *</Label>
          <Input
            id="descripcion"
            {...register('descripcion')}
            error={errors.descripcion?.message}
            placeholder="Ej: Soldadura de marco estructural..."
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar} disabled={cargando}>
            Cancelar
          </Button>
          <Button type="submit" disabled={cargando}>
            {cargando ? 'Guardando...' : 'Agregar Tarea'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
