import { useState } from 'react';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog.js';
import { Button } from '../ui/button.js';
import type { MotivoCierreIntervalo } from '@afull/shared';

const MOTIVOS_PAUSA: { motivo: MotivoCierreIntervalo; etiqueta: string }[] = [
  { motivo: 'PAUSA', etiqueta: 'Pausa breve' },
  { motivo: 'ALMUERZO', etiqueta: 'Almuerzo' },
  { motivo: 'FALTA_MATERIAL', etiqueta: 'Falta de material' },
  { motivo: 'LLUVIA', etiqueta: 'Lluvia / Clima' },
  { motivo: 'OTRO', etiqueta: 'Otro motivo' },
];

type Props = {
  abierto: boolean;
  onCerrar: () => void;
  onConfirmar: (motivo: MotivoCierreIntervalo) => Promise<void>;
  cargando?: boolean;
};

export function ModalPausarTarea({ abierto, onCerrar, onConfirmar, cargando }: Props) {
  const [motivoSeleccionado, setMotivoSeleccionado] = useState<MotivoCierreIntervalo>('PAUSA');

  const handleConfirmar = async () => {
    await onConfirmar(motivoSeleccionado);
  };

  return (
    <Dialog abierto={abierto} onCerrar={onCerrar}>
      <DialogHeader>
        <DialogTitle className="text-lg font-bold text-white">Pausar Tarea</DialogTitle>
        <p className="text-xs text-neutral-400 mt-1">
          Seleccioná el motivo de la pausa antes de detener el cronómetro.
        </p>
      </DialogHeader>

      <div className="grid grid-cols-1 gap-2.5 my-4">
        {MOTIVOS_PAUSA.map((item) => (
          <button
            key={item.motivo}
            type="button"
            onClick={() => setMotivoSeleccionado(item.motivo)}
            className={`flex items-center justify-between min-h-[48px] px-4 py-2.5 rounded-md border text-sm font-medium transition-colors text-left ${
              motivoSeleccionado === item.motivo
                ? 'border-[#ea580c] bg-[#ea580c]/15 text-white'
                : 'border-[#1f2937] bg-[#090a0f] text-neutral-300 hover:border-neutral-700'
            }`}
          >
            <span>{item.etiqueta}</span>
            {motivoSeleccionado === item.motivo && (
              <span className="h-2.5 w-2.5 rounded-full bg-[#ea580c]" />
            )}
          </button>
        ))}
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="ghost"
          onClick={onCerrar}
          disabled={cargando}
          className="min-h-[48px] px-4"
        >
          Volver
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={handleConfirmar}
          disabled={cargando}
          className="min-h-[48px] px-6 bg-[#ea580c] hover:bg-[#c2410c] text-white"
        >
          {cargando ? 'Pausando...' : 'Confirmar Pausa'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
