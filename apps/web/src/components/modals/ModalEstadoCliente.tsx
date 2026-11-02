import { toast } from 'sonner';
import { AlertTriangle, Power } from 'lucide-react';
import type { ClienteFila } from '@afull/shared';
import { useCambiarEstadoCliente } from '../../hooks/clientes/useMutacionesCliente.js';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog.js';
import { Button } from '../ui/button.js';

export type ModalEstadoClienteProps = {
  cliente: ClienteFila | null;
  abierto: boolean;
  onCerrar: () => void;
};

export function ModalEstadoCliente({
  cliente,
  abierto,
  onCerrar,
}: ModalEstadoClienteProps) {
  const clienteId = cliente?.id || '';
  const { mutateAsync: cambiarEstado, isPending } = useCambiarEstadoCliente(clienteId);

  if (!cliente) return null;

  const vaADesactivar = cliente.activo;
  const nuevoEstado = !cliente.activo;

  const handleConfirmar = async () => {
    try {
      const res = await cambiarEstado({
        activo: nuevoEstado,
        updatedAt: cliente.updated_at,
      });

      if (res.advertencia) {
        toast.warning(res.advertencia, { duration: 7000 });
      } else {
        toast.success(
          nuevoEstado
            ? `Cliente "${cliente.nombre}" reactivado correctamente.`
            : `Cliente "${cliente.nombre}" desactivado.`
        );
      }
      onCerrar();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'detalle' in err
          ? String(err.detalle)
          : err instanceof Error
          ? err.message
          : 'Error al cambiar estado del cliente';
      toast.error(msg);
    }
  };

  return (
    <Dialog abierto={abierto} onCerrar={onCerrar}>
      <DialogHeader>
        <div className="flex items-center gap-2 mb-1">
          <div
            className={`rounded-full p-2 border ${
              vaADesactivar
                ? 'bg-amber-950/40 text-amber-400 border-amber-800/40'
                : 'bg-emerald-950/40 text-emerald-400 border-emerald-800/40'
            }`}
          >
            {vaADesactivar ? (
              <AlertTriangle className="h-5 w-5" />
            ) : (
              <Power className="h-5 w-5" />
            )}
          </div>
          <DialogTitle>
            {vaADesactivar ? 'Desactivar Cliente' : 'Reactivar Cliente'}
          </DialogTitle>
        </div>
        <DialogDescription>
          {vaADesactivar ? (
            <span>
              ¿Está seguro que desea desactivar al cliente{' '}
              <strong className="text-white">{cliente.nombre}</strong> (código{' '}
              {cliente.codigo})? No se podrán crear nuevas Órdenes de Trabajo para este cliente.
            </span>
          ) : (
            <span>
              ¿Desea reactivar al cliente{' '}
              <strong className="text-white">{cliente.nombre}</strong>? Volverá a estar
              disponible para operaciones comerciales.
            </span>
          )}
        </DialogDescription>
      </DialogHeader>

      <DialogFooter>
        <Button variant="ghost" onClick={onCerrar} disabled={isPending}>
          Cancelar
        </Button>
        <Button
          variant={vaADesactivar ? 'danger' : 'primary'}
          onClick={handleConfirmar}
          cargando={isPending}
        >
          {vaADesactivar ? 'Confirmar Desactivación' : 'Reactivar Cliente'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
