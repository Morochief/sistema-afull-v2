import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { patchClienteSchema, type ClienteFila } from '@afull/shared';
import { useEditarCliente } from '../../hooks/clientes/useMutacionesCliente.js';
import { obtenerCliente, type PatchCliente } from '../../lib/api-clientes.js';
import { ErrorApi, mensajeDeError } from '../../lib/api.js';
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

const ETIQUETAS: Record<string, string> = {
  nombre: 'nombre',
  razon_social: 'razón social',
  ruc: 'RUC',
  telefono: 'teléfono',
  email: 'email',
  activo: 'estado',
};

function camposCambiados(antes: ClienteFila, despues: ClienteFila): string[] {
  return Object.keys(ETIQUETAS)
    .filter((k) => antes[k as keyof ClienteFila] !== despues[k as keyof ClienteFila])
    .map((k) => ETIQUETAS[k]);
}

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
        // CA-1.13: se conserva lo escrito y se avisa QUÉ cambió el otro usuario. Si vuelve a
        // guardar, sobrescribe esos cambios a sabiendas (no se reintenta solo, D5).
        try {
          const fresco = await obtenerCliente(cliente.id);
          setValue('updatedAt', fresco.updated_at);
          const cambiados = camposCambiados(cliente, fresco);
          toast.warning(
            `Otro usuario modificó este cliente${cambiados.length ? ` (${cambiados.join(', ')})` : ''}. ` +
              'Tus datos siguen en el formulario: si guardás de nuevo, reemplazás sus cambios.',
            { duration: 10000 },
          );
        } catch (e) {
          toast.error(mensajeDeError(e, 'Conflicto al guardar y no se pudo leer la versión actual.'));
        }
        return;
      }
      toast.error(mensajeDeError(err, 'Error al actualizar cliente'));
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
