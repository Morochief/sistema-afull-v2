import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  transicionesDesde,
  type EstadoOT,
  type OTFila,
  type OTDetalle,
} from '@afull/shared';
import { useTransicionarOT } from '../../hooks/ots/useMutacionesOT.js';
import { ErrorApi, mensajeDeError } from '../../lib/api.js';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog.js';
import { Button } from '../ui/button.js';
import { Label } from '../ui/label.js';

export type ModalTransicionOTProps = {
  ot: OTFila | OTDetalle | null;
  abierto: boolean;
  onCerrar: () => void;
  onTransicionExitosa?: () => void;
};

export function ModalTransicionOT({
  ot,
  abierto,
  onCerrar,
  onTransicionExitosa,
}: ModalTransicionOTProps) {
  const otId = ot?.id || '';
  const { mutateAsync: transicionar, isPending } = useTransicionarOT(otId);

  const transicionesValidas = ot ? transicionesDesde(ot.estado) : [];
  const [nuevoEstado, setNuevoEstado] = useState<EstadoOT | ''>('');
  const [comentario, setComentario] = useState('');
  const [errorComentario, setErrorComentario] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto || !ot) return;
    const validas = transicionesDesde(ot.estado);
    if (validas.length > 0) {
      setNuevoEstado(validas[0]);
      setComentario('');
      setErrorComentario(null);
    }
  }, [abierto, ot]);

  if (!ot) return null;

  if (transicionesValidas.length === 0) {
    return (
      <Dialog abierto={abierto} onCerrar={onCerrar}>
        <DialogHeader>
          <DialogTitle>Sin transiciones disponibles</DialogTitle>
          <DialogDescription>
            La OT {ot.codigo_ot} se encuentra en estado final ({ot.estado}) y no puede avanzar.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cerrar</Button>
        </DialogFooter>
      </Dialog>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoEstado) return;

    if (nuevoEstado === 'CANCELADO' && !comentario.trim()) {
      setErrorComentario('Debe ingresar un motivo obligatorio para cancelar la orden.');
      return;
    }
    setErrorComentario(null);

    try {
      await transicionar({
        desde: ot.estado,
        a: nuevoEstado,
        comentario: comentario.trim() || undefined,
      });

      toast.success(`OT "${ot.codigo_ot}" transicionada a ${nuevoEstado}.`);
      onTransicionExitosa?.();
      onCerrar();
    } catch (err: unknown) {
      if (err instanceof ErrorApi && err.status === 409) {
        toast.warning(
          'La OT cambió de estado concurrentemente en el servidor. Se recargará la información.',
          { duration: 8000 }
        );
        onTransicionExitosa?.();
        onCerrar();
        return;
      }
      toast.error(mensajeDeError(err, 'Error al transicionar estado de OT'));
    }
  };

  return (
    <Dialog abierto={abierto} onCerrar={onCerrar}>
      <DialogHeader>
        <DialogTitle>Cambiar Estado: {ot.codigo_ot}</DialogTitle>
        <DialogDescription>
          Estado actual: <strong className="text-white">{ot.estado}</strong>. Seleccione el nuevo
          estado del flujo operativo.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="nuevo-estado">
            Nuevo Estado <span className="text-[#ea580c]">*</span>
          </Label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {transicionesValidas.map((est) => (
              <button
                key={est}
                type="button"
                data-testid={`estado-opcion-${est}`}
                onClick={() => {
                  setNuevoEstado(est);
                  if (est !== 'CANCELADO') setErrorComentario(null);
                }}
                className={`rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
                  nuevoEstado === est
                    ? est === 'CANCELADO'
                      ? 'bg-red-950 text-red-300 border border-red-700'
                      : 'bg-[#ea580c] text-white shadow'
                    : 'bg-[#161922] text-neutral-300 border border-[#1f2937] hover:border-neutral-500'
                }`}
              >
                {est}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label htmlFor="comentario-transicion">
            Comentario {nuevoEstado === 'CANCELADO' && <span className="text-red-400">* (Obligatorio)</span>}
          </Label>
          <textarea
            id="comentario-transicion"
            value={comentario}
            onChange={(e) => {
              setComentario(e.target.value);
              if (e.target.value.trim()) setErrorComentario(null);
            }}
            rows={3}
            placeholder={
              nuevoEstado === 'CANCELADO'
                ? 'Explique el motivo por el cual se cancela la orden...'
                : 'Observaciones sobre el cambio de estado (opcional)...'
            }
            className={`flex w-full rounded-md border bg-[#161922] px-3 py-2 text-xs text-neutral-200 shadow-sm focus:outline-none focus:ring-1 ${
              errorComentario
                ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                : 'border-[#1f2937] focus:border-[#ea580c] focus:ring-[#ea580c]'
            }`}
          />
          {errorComentario && (
            <p className="mt-1 text-xs text-red-400" data-testid="error-comentario">{errorComentario}</p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isPending || !nuevoEstado}>
            {isPending ? 'Procesando...' : 'Confirmar Transición'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
