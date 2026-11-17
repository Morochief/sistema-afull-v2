import { useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { aIso, cerrarConHora, corregirFin, type TramoHoras } from '../../lib/api-horas.js';
import { mensajeDeError } from '../../lib/api.js';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';
import { Label } from '../ui/label.js';

/**
 * Loop 13: cerrar con la hora real un reloj olvidado (abierto) o corregir el fin de un tramo cerrado que quedó largo.
 * El tramo original no se pisa: queda la corrección con quién y por qué.
 */
export function ModalAjusteHora({ tramo, onCerrar }: { tramo: TramoHoras; onCerrar: () => void }) {
  const qc = useQueryClient();
  const [fin, setFin] = useState('');
  const [motivo, setMotivo] = useState('');
  const [cargando, setCargando] = useState(false);
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fin || motivo.trim().length < 3) return toast.error('Poné la hora real y el motivo');
    setCargando(true);
    try {
      if (tramo.abierto) await cerrarConHora(tramo.id, aIso(fin), motivo.trim());
      else await corregirFin(tramo.id, aIso(fin), motivo.trim());
      toast.success(tramo.abierto ? 'Reloj cerrado con la hora real.' : 'Fin corregido: el costo ya usa la hora nueva.');
      void qc.invalidateQueries({ queryKey: ['horas'] });
      onCerrar();
    } catch (er) {
      toast.error(mensajeDeError(er, 'No se pudo guardar'));
    } finally {
      setCargando(false);
    }
  };
  return (
    <Dialog abierto onCerrar={onCerrar}>
      <DialogHeader>
        <DialogTitle>{tramo.abierto ? 'Cerrar con la hora real' : 'Corregir la hora de fin'}</DialogTitle>
        <DialogDescription>{tramo.ot_codigo} · {tramo.tarea}. {tramo.abierto ? 'El reloj sigue corriendo: se cierra a la hora que pongas.' : 'Solo se puede acortar el tramo.'}</DialogDescription>
      </DialogHeader>
      <form onSubmit={guardar} className="space-y-3 text-xs">
        <div><Label htmlFor="ajusteFin">Hora real de fin</Label><Input id="ajusteFin" type="datetime-local" value={fin} onChange={(e) => setFin(e.target.value)} /></div>
        <div><Label htmlFor="ajusteMotivo">Motivo</Label><Input id="ajusteMotivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} placeholder="Ej. se olvidó de pausar al irse" /></div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar} disabled={cargando}>Volver</Button>
          <Button type="submit" disabled={cargando}>{cargando ? 'Guardando…' : 'Guardar'}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
