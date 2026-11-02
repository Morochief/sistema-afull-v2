import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  patchOTSchema,
  esEstadoFinal,
  type OTFila,
  type OTDetalle,
  type SucursalFila,
} from '@afull/shared';
import { useEditarOT } from '../../hooks/ots/useMutacionesOT.js';
import { obtenerOT, type PatchOT } from '../../lib/api-ots.js';
import { obtenerCliente } from '../../lib/api-clientes.js';
import { ErrorApi, mensajeDeError } from '../../lib/api.js';
import { aFechaInput } from '../../lib/fechas.js';
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
  titulo: 'título',
  descripcion: 'descripción',
  fecha_prometida: 'fecha prometida',
  sucursal_id: 'sucursal',
};

function camposCambiados(antes: OTFila, despues: OTFila): string[] {
  return Object.keys(ETIQUETAS)
    .filter((k) => antes[k as keyof OTFila] !== despues[k as keyof OTFila])
    .map((k) => ETIQUETAS[k]);
}

export type ModalEditarOTProps = {
  ot: OTFila | OTDetalle | null;
  abierto: boolean;
  onCerrar: () => void;
};

export function ModalEditarOT({ ot, abierto, onCerrar }: ModalEditarOTProps) {
  const otId = ot?.id || '';
  const { mutateAsync: editar, isPending } = useEditarOT(otId);
  const [sucursales, setSucursales] = useState<SucursalFila[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<PatchOT>({
    resolver: zodResolver(patchOTSchema),
    defaultValues: {
      titulo: '',
      descripcion: '',
      fechaPrometida: '',
      sucursalId: null,
      updatedAt: '',
    },
  });

  useEffect(() => {
    if (!ot || !abierto) return;
    reset({
      titulo: ot.titulo,
      descripcion: ot.descripcion || '',
      fechaPrometida: aFechaInput(ot.fecha_prometida),
      sucursalId: ot.sucursal_id || null,
      updatedAt: ot.updated_at,
    });

    if (ot.cliente_id) {
      obtenerCliente(ot.cliente_id)
        .then((cli) => setSucursales(cli.sucursales.filter((s) => s.activo || s.id === ot.sucursal_id)))
        .catch(() => setSucursales([]));
    }
  }, [ot, abierto, reset]);

  if (ot && esEstadoFinal(ot.estado)) {
    return (
      <Dialog abierto={abierto} onCerrar={onCerrar}>
        <DialogHeader>
          <DialogTitle>OT en Estado Final</DialogTitle>
          <DialogDescription>
            La orden {ot.codigo_ot} se encuentra en estado {ot.estado} y no puede ser editada.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cerrar</Button>
        </DialogFooter>
      </Dialog>
    );
  }

  const onSubmit = async (datos: PatchOT) => {
    if (!ot) return;
    try {
      const payload: PatchOT = {
        titulo: datos.titulo?.trim() || undefined,
        descripcion: datos.descripcion?.trim() || null,
        fechaPrometida: datos.fechaPrometida || null,
        sucursalId: datos.sucursalId || null,
        updatedAt: datos.updatedAt,
      };

      const actualizada = await editar(payload);
      toast.success(`OT "${actualizada.codigo_ot}" actualizada.`);
      onCerrar();
    } catch (err: unknown) {
      if (err instanceof ErrorApi && err.status === 409) {
        try {
          const fresca = await obtenerOT(ot.id);
          setValue('updatedAt', fresca.updated_at);
          const cambiados = camposCambiados(ot, fresca);
          toast.warning(
            `Otro usuario modificó esta OT${cambiados.length ? ` (${cambiados.join(', ')})` : ''}. ` +
              'Tus datos siguen en el formulario: si guardás de nuevo, reemplazás sus cambios.',
            { duration: 10000 },
          );
        } catch (e) {
          toast.error(mensajeDeError(e, 'Conflicto al guardar y no se pudo leer la versión actual.'));
        }
        return;
      }
      toast.error(mensajeDeError(err, 'Error al actualizar OT'));
    }
  };

  return (
    <Dialog abierto={abierto} onCerrar={onCerrar}>
      <DialogHeader>
        <DialogTitle>Editar OT: {ot?.codigo_ot}</DialogTitle>
        <DialogDescription>
          Modifique los datos operativos de la orden de trabajo.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
        <div>
          <Label htmlFor="edit-ot-titulo">
            Título / Trabajo <span className="text-[#ea580c]">*</span>
          </Label>
          <Input
            id="edit-ot-titulo"
            {...register('titulo')}
            error={errors.titulo?.message}
            placeholder="Título del trabajo"
          />
        </div>

        <div>
          <Label htmlFor="edit-ot-sucursal">Sucursal</Label>
          <select
            id="edit-ot-sucursal"
            {...register('sucursalId')}
            className="flex h-9 w-full rounded-md border border-[#1f2937] bg-[#161922] px-3 py-1 text-xs text-neutral-200 shadow-sm focus:border-[#ea580c] focus:outline-none focus:ring-1 focus:ring-[#ea580c]"
          >
            <option value="">(Sin sucursal asignada / Casa Central)</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre} {!s.activo ? '(inactiva)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="edit-ot-descripcion">Descripción</Label>
          <textarea
            id="edit-ot-descripcion"
            {...register('descripcion')}
            rows={3}
            className="flex w-full rounded-md border border-[#1f2937] bg-[#161922] px-3 py-2 text-xs text-neutral-200 shadow-sm focus:border-[#ea580c] focus:outline-none focus:ring-1 focus:ring-[#ea580c]"
          />
        </div>

        <div>
          <Label htmlFor="edit-ot-fechaPrometida">Fecha Prometida de Entrega</Label>
          <Input
            id="edit-ot-fechaPrometida"
            type="date"
            {...register('fechaPrometida')}
            error={errors.fechaPrometida?.message}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Guardando...' : 'Guardar Cambios'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
