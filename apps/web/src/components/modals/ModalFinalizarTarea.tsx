import { useState } from 'react';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';

type Props = {
  abierto: boolean;
  onCerrar: () => void;
  onConfirmar: (comentario?: string) => Promise<void>;
  cargando?: boolean;
};

export function ModalFinalizarTarea({ abierto, onCerrar, onConfirmar, cargando }: Props) {
  const [comentario, setComentario] = useState('');

  const handleConfirmar = async () => {
    await onConfirmar(comentario.trim() ? comentario.trim() : undefined);
    setComentario('');
  };

  return (
    <Dialog abierto={abierto} onCerrar={onCerrar}>
      <DialogHeader>
        <DialogTitle className="text-lg font-bold text-white">Finalizar Tarea</DialogTitle>
        <p className="text-xs text-neutral-400 mt-1">
          Esta acción cerrará el cronómetro y marcará la tarea como LISTO.
        </p>
      </DialogHeader>

      <div className="my-4">
        <label className="block text-xs font-medium text-neutral-300 mb-1.5">
          Comentario u observaciones (opcional)
        </label>
        <Input
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          placeholder="Ej: Terminadas todas las piezas..."
          className="w-full"
          maxLength={1000}
        />
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="ghost"
          onClick={onCerrar}
          disabled={cargando}
          className="min-h-[48px] px-4"
        >
          Cancelar
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={handleConfirmar}
          disabled={cargando}
          className="min-h-[48px] px-6 bg-emerald-600 hover:bg-emerald-500 text-white"
        >
          {cargando ? 'Finalizando...' : 'Marcar como Listo'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
