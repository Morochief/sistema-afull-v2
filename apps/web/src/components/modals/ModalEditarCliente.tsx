import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { patchClienteSchema, type ClienteFila } from '@afull/shared';
import { useEditarCliente } from '../../hooks/clientes/useMutacionesCliente.js';
import { obtenerCliente, type PatchCliente } from '../../lib/api-clientes.js';
import { ErrorApi } from '../../lib/api.js';
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

export type ModalEditarClienteProps = {
  cliente: ClienteFila | null;
  abierto: boolean;
  onCerrar: () => void;
};

export function ModalEditarCliente({
  cliente,
  abierto,
  onCerrar,
}: ModalEditarClienteProps) {
  const clienteId = cliente?.id || '';
  const { mutateAsync: editar, isPending } = useEditarCliente(clienteId);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<PatchCliente>({
    resolver: zodResolver(patchClienteSchema),
    defaultValues: {
      nombre: '',
      razonSocial: '',
      ruc: '',
      telefono: '',
      email: '',
      updatedAt: '',
    },
  });

  useEffect(() => {
    if (cliente && abierto) {
      reset({
        nombre: cliente.nombre,
        razonSocial: cliente.razon_social || '',
        ruc: cliente.ruc || '',
        telefono: cliente.telefono || '',
        email: cliente.email || '',
        updatedAt: cliente.updated_at,
      });
    }
  }, [cliente, abierto, reset]);

  const onSubmit = async (datos: PatchCliente) => {
    if (!cliente) return;
    try {
      const payload: PatchCliente = {
        nombre: datos.nombre?.trim() || undefined,
        razonSocial: datos.razonSocial?.trim() || null,
        ruc: datos.ruc?.trim() || null,
        telefono: datos.telefono?.trim() || null,
        email: datos.email?.trim() || null,
        updatedAt: datos.updatedAt,
      };

      const actualizado = await editar(payload);
      toast.success(`Cliente "${actualizado.nombre}" actualizado.`);
      onCerrar();
    } catch (err: unknown) {
      if (err instanceof ErrorApi && err.status === 409) {
        // CA-1.13: Concurrencia visible sin perder lo escrito en el formulario
        try {
          const fresco = await obtenerCliente(cliente.id);
          setValue('updatedAt', fresco.updated_at);
          toast.error(
            'Conflicto de concurrencia (409): el registro fue modificado por otro usuario. Se actualizó la versión base sin perder tus cambios. Revisa y vuelve a presionar Guardar.',
            { duration: 8000 }
          );
        } catch {
          toast.error('Conflicto 409 al guardar. No se pudo refrescar la versión remota.');
        }
        return;
      }

      const msg =
        err instanceof ErrorApi
          ? typeof err.detalle === 'string'
            ? err.detalle
            : err.message
          : err instanceof Error
          ? err.message
          : 'Error al actualizar cliente';
      toast.error(msg);
    }
  };

  return (
    <Dialog abierto={abierto} onCerrar={onCerrar}>
      <DialogHeader>
        <DialogTitle>Editar Cliente: {cliente?.codigo}</DialogTitle>
        <DialogDescription>
          Modifique los datos comerciales del cliente. Los cambios quedan registrados en auditoría.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
        <div>
          <Label htmlFor="edit-nombre">
            Nombre / Fantasía <span className="text-[#ea580c]">*</span>
          </Label>
          <Input
            id="edit-nombre"
            {...register('nombre')}
            error={errors.nombre?.message}
            placeholder="Nombre comercial"
          />
        </div>

        <div>
          <Label htmlFor="edit-razonSocial">Razón Social</Label>
          <Input
            id="edit-razonSocial"
            {...register('razonSocial')}
            error={errors.razonSocial?.message}
            placeholder="Razón Social legal"
          />
        </div>

        <div>
          <Label htmlFor="edit-ruc">RUC</Label>
          <Input
            id="edit-ruc"
            {...register('ruc')}
            error={errors.ruc?.message}
            placeholder="RUC con dígito verificador"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="edit-telefono">Teléfono</Label>
            <Input
              id="edit-telefono"
              {...register('telefono')}
              error={errors.telefono?.message}
              placeholder="Teléfono"
            />
          </div>

          <div>
            <Label htmlFor="edit-email">Email</Label>
            <Input
              id="edit-email"
              type="email"
              {...register('email')}
              error={errors.email?.message}
              placeholder="Email comercial"
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCerrar} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="submit" cargando={isPending}>
            Guardar Cambios
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
