import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { nuevaOTSchema, type SucursalFila, type ClienteFila } from '@afull/shared';
import { useCrearOT } from '../../hooks/ots/useMutacionesOT.js';
import { obtenerClientes, obtenerCliente } from '../../lib/api-clientes.js';
import type { NuevaOT } from '../../lib/api-ots.js';
import { mensajeDeError } from '../../lib/api.js';
import { useDebounce } from '../../hooks/useDebounce.js';
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
  const { mutateAsync: crear, isPending } = useCrearOT();

  const [busquedaCli, setBusquedaCli] = useState('');
  const debouncedBusqueda = useDebounce(busquedaCli, 300);
  const [clientesEncontrados, setClientesEncontrados] = useState<ClienteFila[]>([]);
  const [clienteSeleccionado, setClienteSeleccionado] = useState<ClienteFila | null>(null);
  const [sucursalesActivas, setSucursalesActivas] = useState<SucursalFila[]>([]);
  const [cargandoClientes, setCargandoClientes] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<NuevaOT>({
    resolver: zodResolver(nuevaOTSchema),
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

  useEffect(() => {
    if (!debouncedBusqueda.trim() || clienteSeleccionado) {
      setClientesEncontrados([]);
      return;
    }
    setCargandoClientes(true);
    obtenerClientes({ q: debouncedBusqueda, estado: 'activos', pagina: 1 })
      .then((res) => setClientesEncontrados(res.items))
      .catch(() => setClientesEncontrados([]))
      .finally(() => setCargandoClientes(false));
  }, [debouncedBusqueda, clienteSeleccionado]);

  const seleccionarCliente = async (c: ClienteFila) => {
    setClienteSeleccionado(c);
    setBusquedaCli('');
    setClientesEncontrados([]);
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
    setBusquedaCli('');
    setClientesEncontrados([]);
    setSucursalesActivas([]);
    onCerrar();
  };

  return (
    <Dialog abierto={abierto} onCerrar={handleCerrar}>
      <DialogHeader>
        <DialogTitle>Nueva Orden de Trabajo</DialogTitle>
        <DialogDescription>
          Cree una nueva OT asociándola a un cliente activo y sucursal.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
        <div>
          <Label>
            Cliente <span className="text-[#ea580c]">*</span>
          </Label>
          {clienteSeleccionado ? (
            <div className="flex items-center justify-between rounded border border-[#1f2937] bg-[#161922] p-2 text-xs">
              <span className="font-semibold text-white">
                {clienteSeleccionado.nombre} ({clienteSeleccionado.codigo})
              </span>
              <button
                type="button"
                onClick={deseleccionarCliente}
                className="text-xs text-[#ea580c] hover:underline"
              >
                Cambiar
              </button>
            </div>
          ) : (
            <div className="relative">
              <Input
                placeholder="Buscar cliente por nombre o RUC..."
                value={busquedaCli}
                onChange={(e) => setBusquedaCli(e.target.value)}
                autoFocus
              />
              {cargandoClientes && (
                <span className="absolute right-3 top-2.5 text-xs text-neutral-400">Buscando...</span>
              )}
              {clientesEncontrados.length > 0 && (
                <div className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded border border-[#1f2937] bg-[#111318] shadow-lg">
                  {clientesEncontrados.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => void seleccionarCliente(c)}
                      className="w-full px-3 py-2 text-left text-xs text-neutral-200 hover:bg-[#1f2937] hover:text-white"
                    >
                      <span className="font-medium">{c.nombre}</span>{' '}
                      <span className="text-neutral-400">({c.codigo})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {errors.clienteId && (
            <p className="mt-1 text-xs text-red-400">Debe seleccionar un cliente.</p>
          )}
        </div>

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
            rows={3}
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
