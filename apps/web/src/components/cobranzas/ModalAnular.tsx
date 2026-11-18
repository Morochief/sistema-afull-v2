import { useState } from 'react';
import { toast } from 'sonner';
import { mensajeDeError } from '../../lib/api.js';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';
import { Label } from '../ui/label.js';

type Props = { titulo: string | null; aviso: string; onCerrar: () => void; onAnular: (motivo: string) => Promise<unknown> };

/** Anular una factura o un recibo: no se borra, queda marcado con el motivo (y el recibo sale con la marca ANULADO). */
export function ModalAnular({ titulo, aviso, onCerrar, onAnular }: Props) {
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const cerrar = () => { setMotivo(''); setError(''); onCerrar(); };
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (motivo.trim().length < 3) return setError('Escribí el motivo');
    setCargando(true);
    try {
      await onAnular(motivo.trim());
      toast.success(`${titulo} anulado.`);
      cerrar();
    } catch (er) {
      toast.error(mensajeDeError(er, 'No se pudo anular'));
    } finally {
      setCargando(false);
    }
  };
  return (
    <Dialog abierto={titulo !== null} onCerrar={cerrar}>
      <DialogHeader>
        <DialogTitle>Anular {titulo}</DialogTitle>
        <DialogDescription>{aviso}</DialogDescription>
      </DialogHeader>
      <form onSubmit={enviar} className="space-y-4">
        <div>
          <Label htmlFor="anMotivo">Motivo <span className="text-[#ea580c]">*</span></Label>
          <Input id="anMotivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} error={error} placeholder="Ej: cheque rechazado" />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={cerrar}>Volver</Button>
          <Button type="submit" variant="danger" disabled={cargando}>{cargando ? 'Anulando…' : 'Anular'}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
