import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { MarcaFila } from '@afull/shared';
import {
  crearMarca,
  editarMarca,
  type NuevaMarca,
  type PatchMarca,
} from '../../lib/api-subrecursos.js';
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

export type ModalMarcaProps = {
  clienteId: string;
  marca: MarcaFila | null;
  abierto: boolean;
  onCerrar: () => void;
};

type FormMarcaValues = {
  nombre: string;
};

export function ModalMarca({
  clienteId,
  marca,
  abierto,
  onCerrar,
}: ModalMarcaProps) {
  const queryClient = useQueryClient();
  const [cargando, setCargando] = useState(false);
  const esEdicion = Boolean(marca);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormMarcaValues>({
    defaultValues: { nombre: '' },
  });

  useEffect(() => {
    if (abierto) {
      reset({ nombre: marca ? marca.nombre : '' });
    }
  }, [abierto, marca, reset]);

  const onSubmit = async (values: FormMarcaValues) => {
    setCargando(true);
    try {
      if (esEdicion && marca) {
        const patch: PatchMarca = { nombre: values.nombre.trim() };
        await editarMarca(clienteId, marca.id, patch);
        toast.success(`Marca "${values.nombre}" actualizada.`);
      } else {
        const nueva: NuevaMarca = { nombre: values.nombre.trim() };
        await crearMarca(clienteId, nueva);
        toast.success(`Marca "${values.nombre}" registrada.`);
      }

      await queryClient.invalidateQueries({ queryKey: ['cliente', clienteId] });
      onCerrar();
    } catch (err: unknown) {
      toast.error(mensajeDeError(err, 'Error al guardar marca'));
    } finally {
      setCargando(false);
    }
  };

  return (
    <Dialog abierto={abierto} onCerrar={onCerrar}>
      <DialogHeader>
        <DialogTitle>{esEdicion ? 'Editar Marca' : 'Nueva Marca'}</DialogTitle>
        <DialogDescription>
          {esEdicion
            ? 'Actualice la denominación de la marca comercial.'
            : 'Registre una marca asociada a los productos o cartelería del cliente.'}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
        <div>
          <Label htmlFor="marca-nombre">
            Nombre de la Marca <span className="text-[#ea580c]">*</span>
          </Label>
          <Input
            id="marca-nombre"
            {...register('nombre', { required: 'Nombre requerido' })}
            error={errors.nombre?.message}
            placeholder="Ej. Coca-Cola / Nivea"
            autoFocus
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCerrar} disabled={cargando}>
            Cancelar
          </Button>
          <Button type="submit" cargando={cargando}>
            {esEdicion ? 'Guardar Cambios' : 'Registrar Marca'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
