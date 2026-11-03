import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { resolverSinVacios } from '../../lib/formulario.js';
import { toast } from 'sonner';
import { nuevaPersonaSchema } from '@afull/shared';
import { crearPersona, type NuevaPersona } from '../../lib/api-personas.js';
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
  onCreada: () => void;
};

export function ModalNuevaPersona({ abierto, onCerrar, onCreada }: Props) {
  const [cargando, setCargando] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<NuevaPersona>({
    resolver: resolverSinVacios(nuevaPersonaSchema),
    defaultValues: {
      nombre: '',
      ci: '',
      cargo: '',
      departamento: '',
    },
  });

  const onSubmit = async (datos: NuevaPersona) => {
    setCargando(true);
    try {
      await crearPersona({
        nombre: datos.nombre.trim(),
        ci: datos.ci.trim(),
        cargo: datos.cargo?.trim() || undefined,
        departamento: datos.departamento?.trim() || undefined,
      });
      toast.success('Persona creada exitosamente.');
      reset();
      onCreada();
      onCerrar();
    } catch (err) {
      toast.error(mensajeDeError(err, 'Error al crear persona'));
    } finally {
      setCargando(false);
    }
  };

  return (
    <Dialog abierto={abierto} onCerrar={onCerrar}>
      <DialogHeader>
        <DialogTitle>Nueva Persona / Colaborador</DialogTitle>
        <DialogDescription>
          Registre una nueva ficha de personal en el sistema de recursos humanos.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
        <div>
          <Label htmlFor="nombre">
            Nombre Completo <span className="text-[#ea580c]">*</span>
          </Label>
          <Input
            id="nombre"
            {...register('nombre')}
            error={errors.nombre?.message}
            placeholder="Ej: Carlos Benítez"
            autoFocus
          />
        </div>

        <div>
          <Label htmlFor="ci">
            Cédula de Identidad (C.I.) <span className="text-[#ea580c]">*</span>
          </Label>
          <Input
            id="ci"
            {...register('ci')}
            error={errors.ci?.message}
            placeholder="Ej: 3456789"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="cargo">Cargo</Label>
            <Input
              id="cargo"
              {...register('cargo')}
              placeholder="Ej: Soldador / Armador"
            />
          </div>

          <div>
            <Label htmlFor="departamento">Departamento</Label>
            <Input
              id="departamento"
              {...register('departamento')}
              placeholder="Ej: Taller Metalúrgico"
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar} disabled={cargando}>
            Cancelar
          </Button>
          <Button type="submit" disabled={cargando}>
            {cargando ? 'Guardando...' : 'Crear Ficha'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
