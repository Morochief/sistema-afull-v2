import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { ContactoFila } from '@afull/shared';
import {
  crearContacto,
  editarContacto,
  type NuevoContacto,
  type PatchContacto,
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

export type ModalContactoProps = {
  clienteId: string;
  contacto: ContactoFila | null;
  abierto: boolean;
  onCerrar: () => void;
};

type FormContactoValues = {
  nombre: string;
  cargo: string;
  telefono: string;
  email: string;
  esPrincipal: boolean;
};

export function ModalContacto({
  clienteId,
  contacto,
  abierto,
  onCerrar,
}: ModalContactoProps) {
  const queryClient = useQueryClient();
  const [cargando, setCargando] = useState(false);
  const esEdicion = Boolean(contacto);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormContactoValues>({
    defaultValues: {
      nombre: '',
      cargo: '',
      telefono: '',
      email: '',
      esPrincipal: false,
    },
  });

  useEffect(() => {
    if (abierto) {
      if (contacto) {
        reset({
          nombre: contacto.nombre,
          cargo: contacto.cargo || '',
          telefono: contacto.telefono || '',
          email: contacto.email || '',
          esPrincipal: contacto.es_principal,
        });
      } else {
        reset({
          nombre: '',
          cargo: '',
          telefono: '',
          email: '',
          esPrincipal: false,
        });
      }
    }
  }, [abierto, contacto, reset]);

  const onSubmit = async (values: FormContactoValues) => {
    setCargando(true);
    try {
      if (esEdicion && contacto) {
        const patch: PatchContacto = {
          nombre: values.nombre.trim(),
          cargo: values.cargo.trim() || null,
          telefono: values.telefono.trim() || null,
          email: values.email.trim() || null,
          esPrincipal: values.esPrincipal,
        };
        await editarContacto(clienteId, contacto.id, patch);
        toast.success(`Contacto "${values.nombre}" actualizado.`);
      } else {
        const nuevo: NuevoContacto = {
          nombre: values.nombre.trim(),
          cargo: values.cargo.trim() || undefined,
          telefono: values.telefono.trim() || undefined,
          email: values.email.trim() || undefined,
          esPrincipal: values.esPrincipal,
        };
        await crearContacto(clienteId, nuevo);
        toast.success(`Contacto "${values.nombre}" creado.`);
      }

      await queryClient.invalidateQueries({ queryKey: ['cliente', clienteId] });
      onCerrar();
    } catch (err: unknown) {
      toast.error(mensajeDeError(err, 'Error al guardar contacto'));
    } finally {
      setCargando(false);
    }
  };

  return (
    <Dialog abierto={abierto} onCerrar={onCerrar}>
      <DialogHeader>
        <DialogTitle>{esEdicion ? 'Editar Contacto' : 'Nuevo Contacto'}</DialogTitle>
        <DialogDescription>
          {esEdicion
            ? 'Actualice la información de contacto y su jerarquía.'
            : 'Agregue una persona de contacto asociada al cliente.'}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
        <div>
          <Label htmlFor="cont-nombre">
            Nombre y Apellido <span className="text-[#ea580c]">*</span>
          </Label>
          <Input
            id="cont-nombre"
            {...register('nombre', { required: 'Nombre requerido' })}
            error={errors.nombre?.message}
            placeholder="Ej. Ing. María González"
            autoFocus
          />
        </div>

        <div>
          <Label htmlFor="cont-cargo">Cargo / Rol</Label>
          <Input id="cont-cargo" {...register('cargo')} placeholder="Ej. Gerente de Marketing" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="cont-telefono">Teléfono</Label>
            <Input id="cont-telefono" {...register('telefono')} placeholder="Ej. 0981 123456" />
          </div>
          <div>
            <Label htmlFor="cont-email">Email</Label>
            <Input id="cont-email" type="email" {...register('email')} placeholder="maria@empresa.com" />
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <input
            type="checkbox"
            id="cont-principal"
            {...register('esPrincipal')}
            className="h-4 w-4 rounded border-[#1f2937] bg-[#111318] text-[#ea580c] focus:ring-[#ea580c]"
          />
          <Label htmlFor="cont-principal" className="mb-0 text-xs font-medium text-neutral-200 cursor-pointer">
            Marcar como Contacto Principal
          </Label>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCerrar} disabled={cargando}>
            Cancelar
          </Button>
          <Button type="submit" cargando={cargando}>
            {esEdicion ? 'Guardar Cambios' : 'Crear Contacto'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
