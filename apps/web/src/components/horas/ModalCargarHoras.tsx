import { useState } from 'react';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { aIso, cargarHorasManual, tareasParaHoras } from '../../lib/api-horas.js';
import { mensajeDeError } from '../../lib/api.js';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';
import { Label } from '../ui/label.js';

/** Loop 13: alguien trabajó sin celular. Se carga un tramo cerrado sobre una de sus tareas, con el motivo. */
export function ModalCargarHoras({ persona, onCerrar }: { persona: { id: string; nombre: string }; onCerrar: () => void }) {
  const qc = useQueryClient();
  const { data: tareas = [] } = useQuery({ queryKey: ['horas', 'tareas', persona.id], queryFn: () => tareasParaHoras(persona.id) });
  const [tarea, setTarea] = useState('');
  const [inicio, setInicio] = useState('');
  const [fin, setFin] = useState('');
  const [motivo, setMotivo] = useState('');
  const [cargando, setCargando] = useState(false);
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tarea || !inicio || !fin || motivo.trim().length < 3) return toast.error('Completá la tarea, el inicio, el fin y el motivo');
    setCargando(true);
    try {
      await cargarHorasManual({ tareaId: tarea, personaId: persona.id, horaInicio: aIso(inicio), horaFin: aIso(fin), motivo: motivo.trim() });
      toast.success('Horas cargadas: ya suman al costo de la OT.');
      void qc.invalidateQueries({ queryKey: ['horas'] });
      onCerrar();
    } catch (er) {
      toast.error(mensajeDeError(er, 'No se pudieron cargar'));
    } finally {
      setCargando(false);
    }
  };
  return (
    <Dialog abierto onCerrar={onCerrar}>
      <DialogHeader>
        <DialogTitle>Cargar horas a mano · {persona.nombre}</DialogTitle>
        <DialogDescription>Para cuando trabajó sin celular. Queda marcado "a mano", con quién lo cargó y por qué.</DialogDescription>
      </DialogHeader>
      <form onSubmit={guardar} className="space-y-3 text-xs">
        <div>
          <Label htmlFor="manualTarea">Tarea</Label>
          <select id="manualTarea" value={tarea} onChange={(e) => setTarea(e.target.value)} className="h-9 w-full rounded border border-[#1f2937] bg-[#111318] px-2 text-xs text-neutral-200">
            <option value="">Elegí la tarea…</option>
            {tareas.map((t) => <option key={t.id} value={t.id}>{`${t.codigo_ot} · ${t.cliente} · ${t.descripcion}`}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label htmlFor="manualInicio">Inicio</Label><Input id="manualInicio" type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} /></div>
          <div><Label htmlFor="manualFin">Fin</Label><Input id="manualFin" type="datetime-local" value={fin} onChange={(e) => setFin(e.target.value)} /></div>
        </div>
        <div><Label htmlFor="manualMotivo">Motivo</Label><Input id="manualMotivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} placeholder="Ej. trabajó sin celular" /></div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar} disabled={cargando}>Volver</Button>
          <Button type="submit" disabled={cargando}>{cargando ? 'Cargando…' : 'Cargar'}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
