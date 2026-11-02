import { useForm } from 'react-hook-form';
import { resolverSinVacios } from '../../lib/formulario.js';
import { toast } from 'sonner';
import { nuevoClienteSchema } from '@afull/shared';
import { useCrearCliente } from '../../hooks/clientes/useMutacionesCliente.js';
import type { NuevoCliente } from '../../lib/api-clientes.js';
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

export type ModalNuevoClienteProps = {
  abierto: boolean;
  onCerrar: () => void;
};

export function ModalNuevoCliente({ abierto, onCerrar }: ModalNuevoClienteProps) {
  const { mutateAsync: crear, isPending } = useCrearCliente();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<NuevoCliente>({
    resolver: resolverSinVacios(nuevoClienteSchema),
    defaultValues: {
      nombre: '',
      razonSocial: '',
      ruc: '',
      telefono: '',
      email: '',
    },
  });

  const onSubmit = async (datos: NuevoCliente) => {
    try {
      // Limpiar strings vacíos para campos opcionales
      const payload: NuevoCliente = {
        nombre: datos.nombre.trim(),
        razonSocial: datos.razonSocial?.trim() || undefined,
        ruc: datos.ruc?.trim() || undefined,
        telefono: datos.telefono?.trim() || undefined,
        email: datos.email?.trim() || undefined,
      };

      const creado = await crear(payload);
      toast.success(`Cliente "${creado.nombre}" creado con código ${creado.codigo}`);
      reset();
      onCerrar();
    } catch (err: unknown) {
      toast.error(mensajeDeError(err, 'Error al registrar cliente'));
    }
  };

  const handleCerrar = () => {
    reset();
    onCerrar();
  };

  return (
    <Dialog abierto={abierto} onCerrar={handleCerrar}>
      <DialogHeader>
        <DialogTitle>Nuevo Cliente</DialogTitle>
        <DialogDescription>
          Complete los datos principales del cliente para darlo de alta en el sistema.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
        <div>
          <Label htmlFor="nombre">
            Nombre / Fantasía <span className="text-[#ea580c]">*</span>
          </Label>
          <Input
            id="nombre"
            {...register('nombre')}
            error={errors.nombre?.message}
            placeholder="Ej. Supermercados Stock"
            autoFocus
          />
        </div>

        <div>
          <Label htmlFor="razonSocial">Razón Social</Label>
          <Input
            id="razonSocial"
            {...register('razonSocial')}
            error={errors.razonSocial?.message}
            placeholder="Ej. Retail S.A."
          />
        </div>

        <div>
          <Label htmlFor="ruc">RUC / Identificación Fiscal</Label>
          <Input
            id="ruc"
            {...register('ruc')}
            error={errors.ruc?.message}
            placeholder="Ej. 80012345-6"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="telefono">Teléfono</Label>
            <Input
              id="telefono"
              {...register('telefono')}
              error={errors.telefono?.message}
              placeholder="Ej. +595 21 123456"
            />
          </div>

          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              {...register('email')}
              error={errors.email?.message}
              placeholder="contacto@empresa.com"
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={handleCerrar} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="submit" cargando={isPending}>
            Guardar Cliente
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
