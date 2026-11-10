import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { resolverSinVacios } from '../../lib/formulario.js';
import { toast } from 'sonner';
import { nuevaOTSchema, type SucursalFila, type ClienteFila } from '@afull/shared';
import { useCrearOT } from '../../hooks/ots/useMutacionesOT.js';
import { obtenerCliente } from '../../lib/api-clientes.js';
import type { NuevaOT } from '../../lib/api-ots.js';
import { mensajeDeError } from '../../lib/api.js';
import { SelectorClienteOT } from '../forms/SelectorClienteOT.js';
import { SelectorTareasOT, type TareaFormItem } from '../forms/SelectorTareasOT.js';
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

export type ModalNuevaOTProps = {
  abierto: boolean;
  onCerrar: () => void;
  clienteInicialId?: string;
};

export function ModalNuevaOT({ abierto, onCerrar, clienteInicialId }: ModalNuevaOTProps) {
  const [activarHoja, setActivarHoja] = useState(false);
  const { mutateAsync: crear, isPending } = useCrearOT();

  const [clienteSeleccionado, setClienteSeleccionado] = useState<ClienteFila | null>(null);
  const [sucursalesActivas, setSucursalesActivas] = useState<SucursalFila[]>([]);
  const [tareas, setTareas] = useState<TareaFormItem[]>([]);

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<NuevaOT>({
    resolver: resolverSinVacios(nuevaOTSchema),
    defaultValues: {
      clienteId: clienteInicialId || '',
      sucursalId: undefined,
      titulo: '',
      descripcion: '',
      fechaPrometida: '',
    },
  });

  useEffect(() => {
    if (!abierto) return;
    if (clienteInicialId) {
      obtenerCliente(clienteInicialId)
        .then((c) => {
          setClienteSeleccionado(c);
          setValue('clienteId', c.id);
          setSucursalesActivas(c.sucursales.filter((s) => s.activo));
        })
        .catch(() => {});
    }
  }, [abierto, clienteInicialId, setValue]);

  const seleccionarCliente = async (c: ClienteFila) => {
    setClienteSeleccionado(c);
    setValue('clienteId', c.id, { shouldValidate: true });
    try {
      const detalle = await obtenerCliente(c.id);
      setSucursalesActivas(detalle.sucursales.filter((s) => s.activo));
    } catch {
      setSucursalesActivas([]);
    }
  };

  const deseleccionarCliente = () => {
    setClienteSeleccionado(null);
    setValue('clienteId', '', { shouldValidate: true });
    setValue('sucursalId', undefined);
    setSucursalesActivas([]);
  };

  const onSubmit = async (datos: NuevaOT) => {
    try {
      const payload: NuevaOT = {
        clienteId: datos.clienteId,
        sucursalId: datos.sucursalId || undefined,
        titulo: datos.titulo.trim(),
        descripcion: datos.descripcion?.trim() || undefined,
        fechaPrometida: datos.fechaPrometida || undefined,
        activarHoja: activarHoja || undefined,
        tareas:
          tareas.length > 0
            ? tareas
                .filter((t) => t.descripcion.trim())
                .map((t) => ({
                  tipo: t.tipo,
                  descripcion: t.descripcion.trim(),
                  personaAsignadaId: t.personaAsignadaId || undefined,
                }))
            : undefined,
      };

      const creada = await crear(payload);
      toast.success(`OT "${creada.codigo_ot}" creada exitosamente.`);
      handleCerrar();
    } catch (err: unknown) {
      toast.error(mensajeDeError(err, 'Error al crear Orden de Trabajo'));
    }
  };

  const handleCerrar = () => {
    reset();
    setClienteSeleccionado(null);
    setSucursalesActivas([]);
    setTareas([]);
    onCerrar();
  };

  return (
    <Dialog abierto={abierto} onCerrar={handleCerrar}>
      <DialogHeader>
        <DialogTitle>Nueva Orden de Trabajo</DialogTitle>
        <DialogDescription>
          Cree una nueva OT asociándola a un cliente activo, sucursal y tareas iniciales.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
        <SelectorClienteOT
          clienteSeleccionado={clienteSeleccionado}
          onSeleccionar={(c) => void seleccionarCliente(c)}
          onDeseleccionar={deseleccionarCliente}
          error={errors.clienteId ? 'Debe seleccionar un cliente.' : undefined}
        />

        <div>
          <Label htmlFor="sucursalId">Sucursal (opcional)</Label>
          <select
            id="sucursalId"
            {...register('sucursalId')}
            disabled={!clienteSeleccionado || sucursalesActivas.length === 0}
            className="flex h-9 w-full rounded-md border border-[#1f2937] bg-[#161922] px-3 py-1 text-xs text-neutral-200 shadow-sm focus:border-[#ea580c] focus:outline-none focus:ring-1 focus:ring-[#ea580c] disabled:opacity-50"
          >
            <option value="">(Sin sucursal asignada / Casa Central)</option>
            {sucursalesActivas.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre} {s.ciudad ? `— ${s.ciudad}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="titulo">
            Título / Trabajo <span className="text-[#ea580c]">*</span>
          </Label>
          <Input
            id="titulo"
            {...register('titulo')}
            error={errors.titulo?.message}
            placeholder="Ej. Cartel Frontlight 4x2 mts"
          />
        </div>

        <div>
          <Label htmlFor="descripcion">Descripción</Label>
          <textarea
            id="descripcion"
            {...register('descripcion')}
            rows={2}
            placeholder="Detalles técnicos, materiales o requerimientos específicos..."
            className="flex w-full rounded-md border border-[#1f2937] bg-[#161922] px-3 py-2 text-xs text-neutral-200 shadow-sm focus:border-[#ea580c] focus:outline-none focus:ring-1 focus:ring-[#ea580c]"
          />
        </div>

        <div>
          <Label htmlFor="fechaPrometida">Fecha Prometida de Entrega</Label>
          <Input
            id="fechaPrometida"
            type="date"
            {...register('fechaPrometida')}
            error={errors.fechaPrometida?.message}
          />
        </div>

        <SelectorTareasOT tareas={tareas} onChange={setTareas} />

        <label className="flex items-start gap-2 text-xs text-neutral-300">
          <input type="checkbox" checked={activarHoja} onChange={(e) => setActivarHoja(e.target.checked)} className="mt-0.5" />
          <span><strong className="text-white">Urgente: activar la hoja de ruta ya.</strong> Los operarios ven sus tareas enseguida. Si no, queda en borrador para que Gerardo la arme y la mande.</span>
        </label>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleCerrar} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Guardando...' : 'Crear OT'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
