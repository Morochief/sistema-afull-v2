import { useEffect, useState } from 'react';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog.js';
import { Button } from '../ui/button.js';

export const SUGERENCIAS_REMOTO = ['Salí desde casa con el camión', 'Fui directo al local del cliente', 'Estoy en otra obra'];

/** Loop 16: fuera de la zona, la marcación pide el porqué (no bloquea: RR.HH. lo ve con el motivo). */
export function ModalMotivoRemoto({ aviso, onListo }: { aviso: string | null; onListo: (motivo: string | null) => void }) {
  const [motivo, setMotivo] = useState('');
  useEffect(() => { if (aviso) setMotivo(''); }, [aviso]);
  const ok = motivo.trim().length >= 3;
  return (
    <Dialog abierto={!!aviso} onCerrar={() => onListo(null)}>
      <DialogHeader>
        <DialogTitle>Estás fuera de la zona</DialogTitle>
        <DialogDescription>{aviso}</DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {SUGERENCIAS_REMOTO.map((s) => (
            <button key={s} type="button" onClick={() => setMotivo(s)}
              className={`rounded border px-2 py-1.5 text-xs ${motivo === s ? 'border-[#ea580c] text-white' : 'border-[#1f2937] text-neutral-300'}`}>{s}</button>
          ))}
        </div>
        <label htmlFor="motivo-remoto" className="block text-xs text-neutral-400">Por qué marcás desde acá</label>
        <textarea id="motivo-remoto" rows={2} maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)}
          className="w-full rounded-md border border-[#1f2937] bg-[#161922] px-3 py-2 text-xs text-neutral-200" />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onListo(null)}>Cancelar</Button>
        <Button type="button" disabled={!ok} onClick={() => onListo(motivo.trim())}>Marcar igual</Button>
      </DialogFooter>
    </Dialog>
  );
}
