import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { resolverSinVacios } from '../../lib/formulario.js';
import { toast } from 'sonner';
import { patchPersonaSchema, type PersonaFila } from '@afull/shared';
import { editarPersona, type PatchPersona } from '../../lib/api-personas.js';
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
  persona: PersonaFila | null;
  onCerrar: () => void;
  onGuardada: () => void;
};

export function ModalEditarPersona({ persona, onCerrar, onGuardada }: Props) {
  const [cargando, setCargando] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PatchPersona>({
    resolver: resolverSinVacios(patchPersonaSchema),
  });

  useEffect(() => {
    if (!persona) return;
    reset({
      nombre: persona.nombre,
      ci: persona.ci,
      cargo: persona.cargo || '',
      departamento: persona.departamento || '',
      updatedAt: persona.updated_at,
    });
  }, [persona, reset]);

  if (!persona) return null;

  const onSubmit = async (datos: PatchPersona) => {
    setCargando(true);
    try {
      await editarPersona(persona.id, {
        nombre: datos.nombre?.trim(),
        ci: datos.ci?.trim(),
        cargo: datos.cargo?.trim() || null,
        departamento: datos.departamento?.trim() || null,
        updatedAt: persona.updated_at,
      });
      toast.success('Datos actualizados correctamente.');
      onGuardada();
      onCerrar();
    } catch (err) {
      toast.error(mensajeDeError(err, 'Error al editar persona'));
    } finally {
      setCargando(false);
    }
  };

  return (
    <Dialog abierto={Boolean(persona)} onCerrar={onCerrar}>
      <DialogHeader>
        <DialogTitle>Editar Colaborador</DialogTitle>
        <DialogDescription>
          Modifique los datos personales o de afiliación laboral.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
        <div>
          <Label htmlFor="nombreEdit">Nombre Completo *</Label>
          <Input
            id="nombreEdit"
            {...register('nombre')}
            error={errors.nombre?.message}
          />
        </div>

        <div>
          <Label htmlFor="ciEdit">Cédula de Identidad (C.I.) *</Label>
          <Input
            id="ciEdit"
            {...register('ci')}
            error={errors.ci?.message}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="cargoEdit">Cargo</Label>
            <Input id="cargoEdit" {...register('cargo')} />
          </div>

          <div>
            <Label htmlFor="deptoEdit">Departamento</Label>
            <Input id="deptoEdit" {...register('departamento')} />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar} disabled={cargando}>
            Cancelar
          </Button>
          <Button type="submit" disabled={cargando}>
            {cargando ? 'Guardando...' : 'Guardar Cambios'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
