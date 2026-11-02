import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertCircle, MapPin } from 'lucide-react';
import type { SucursalFila } from '@afull/shared';
import {
  crearSucursal,
  editarSucursal,
  type NuevaSucursal,
  type PatchSucursal,
} from '../../lib/api-subrecursos.js';
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

export type ModalSucursalProps = {
  clienteId: string;
  sucursal: SucursalFila | null;
  abierto: boolean;
  onCerrar: () => void;
};

type FormSucursalValues = {
  nombre: string;
  ciudad: string;
  direccion: string;
  gpsLat: string;
  gpsLng: string;
};

export function ModalSucursal({
  clienteId,
  sucursal,
  abierto,
  onCerrar,
}: ModalSucursalProps) {
  const queryClient = useQueryClient();
  const [cargando, setCargando] = useState(false);
  const esEdicion = Boolean(sucursal);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormSucursalValues>({
    defaultValues: {
      nombre: '',
      ciudad: '',
      direccion: '',
      gpsLat: '-25.3000',
      gpsLng: '-57.6000',
    },
  });

  const latActual = parseFloat(watch('gpsLat'));
  const lngActual = parseFloat(watch('gpsLng'));
  const fueraDeParaguay =
    !isNaN(latActual) &&
    !isNaN(lngActual) &&
    (latActual < -27.7 || latActual > -19.2 || lngActual < -62.7 || lngActual > -54.2);

  useEffect(() => {
    if (abierto) {
      if (sucursal) {
        reset({
          nombre: sucursal.nombre,
          ciudad: sucursal.ciudad || '',
          direccion: sucursal.direccion || '',
          gpsLat: sucursal.gps_lat,
          gpsLng: sucursal.gps_lng,
        });
      } else {
        reset({
          nombre: '',
          ciudad: 'Asunción',
          direccion: '',
          gpsLat: '-25.2867',
          gpsLng: '-57.6470',
        });
      }
    }
  }, [abierto, sucursal, reset]);

  const onSubmit = async (values: FormSucursalValues) => {
    const lat = parseFloat(values.gpsLat);
    const lng = parseFloat(values.gpsLng);

    if (isNaN(lat) || isNaN(lng)) {
      toast.error('Las coordenadas GPS deben ser números válidos.');
      return;
    }

    if (lat < -27.7 || lat > -19.2 || lng < -62.7 || lng > -54.2) {
      toast.error('Coordenadas fuera del territorio paraguayo (Lat: -27.7 a -19.2, Lng: -62.7 a -54.2).');
      return;
    }

    setCargando(true);
    try {
      if (esEdicion && sucursal) {
        const patch: PatchSucursal = {
          nombre: values.nombre.trim(),
          ciudad: values.ciudad.trim() || null,
          direccion: values.direccion.trim() || null,
          gpsLat: lat,
          gpsLng: lng,
          updatedAt: sucursal.updated_at,
        };
        await editarSucursal(clienteId, sucursal.id, patch);
        toast.success(`Sucursal "${values.nombre}" actualizada.`);
      } else {
        const nueva: NuevaSucursal = {
          nombre: values.nombre.trim(),
          ciudad: values.ciudad.trim() || undefined,
          direccion: values.direccion.trim() || undefined,
          gpsLat: lat,
          gpsLng: lng,
        };
        await crearSucursal(clienteId, nueva);
        toast.success(`Sucursal "${values.nombre}" creada.`);
      }

      await queryClient.invalidateQueries({ queryKey: ['cliente', clienteId] });
      onCerrar();
    } catch (err: unknown) {
      if (err instanceof ErrorApi && err.status === 409) {
        toast.error('Conflicto 409: La sucursal fue modificada por otro usuario. Recargue el detalle.');
      } else {
        toast.error(mensajeDeError(err, 'Error al guardar sucursal'));
      }
    } finally {
      setCargando(false);
    }
  };

  return (
    <Dialog abierto={abierto} onCerrar={onCerrar}>
      <DialogHeader>
        <DialogTitle>{esEdicion ? 'Editar Sucursal' : 'Nueva Sucursal'}</DialogTitle>
        <DialogDescription>
          {esEdicion
            ? 'Actualice la información y geolocalización de la sucursal.'
            : 'Registre una nueva sucursal o punto de instalación para este cliente.'}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
        <div>
          <Label htmlFor="suc-nombre">
            Nombre de Sucursal <span className="text-[#ea580c]">*</span>
          </Label>
          <Input
            id="suc-nombre"
            {...register('nombre', { required: 'Nombre requerido' })}
            error={errors.nombre?.message}
            placeholder="Ej. Casa Central / Sucursal Mariscal"
            autoFocus
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="suc-ciudad">Ciudad</Label>
            <Input id="suc-ciudad" {...register('ciudad')} placeholder="Ej. Asunción" />
          </div>
          <div>
            <Label htmlFor="suc-direccion">Dirección</Label>
            <Input id="suc-direccion" {...register('direccion')} placeholder="Ej. Av. Mariscal López 1234" />
          </div>
        </div>

        <div className="rounded-md border border-[#1f2937] bg-[#161922] p-3 space-y-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-300">
            <MapPin className="h-3.5 w-3.5 text-[#ea580c]" />
            <span>Coordenadas GPS (Paraguay)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="suc-lat">Latitud</Label>
              <Input
                id="suc-lat"
                step="any"
                {...register('gpsLat', { required: true })}
                placeholder="-25.2867"
              />
            </div>
            <div>
              <Label htmlFor="suc-lng">Longitud</Label>
              <Input
                id="suc-lng"
                step="any"
                {...register('gpsLng', { required: true })}
                placeholder="-57.6470"
              />
            </div>
          </div>

          {fueraDeParaguay && (
            <div className="flex items-center gap-1.5 text-[11px] text-amber-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>Advertencia: Las coordenadas están fuera del límite de Paraguay.</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCerrar} disabled={cargando}>
            Cancelar
          </Button>
          <Button type="submit" cargando={cargando}>
            {esEdicion ? 'Guardar Cambios' : 'Crear Sucursal'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
