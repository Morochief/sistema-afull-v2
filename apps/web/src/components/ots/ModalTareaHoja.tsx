import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { PersonaAsignable, TareaFila } from '@afull/shared';
import { crearTareaOT, editarTarea } from '../../lib/api-tareas.js';
import { obtenerPersonasAsignables } from '../../lib/api-personas.js';
import { mensajeDeError } from '../../lib/api.js';
import { numero } from '../../lib/numero.js';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';
import { Label } from '../ui/label.js';
import { OpcionesProceso } from '../procesos/OpcionesProceso.js';

const selectCls = 'flex h-9 w-full rounded-md border border-[#1f2937] bg-[#161922] px-3 py-1 text-xs text-neutral-200';
const opcional = (v: string) => (v.trim() ? v.trim() : null);

/** Alta o edición de una tarea de la hoja de ruta: operario, qué hacer, día, cantidad y tiempo estimado (Loop 11). */
export function ModalTareaHoja({ otId, tarea, abierto, onCerrar, onGuardada }: {
  otId: string; tarea?: TareaFila | null; abierto: boolean; onCerrar: () => void; onGuardada: () => void;
}) {
  const [asignables, setAsignables] = useState<PersonaAsignable[]>([]);
  const [f, setF] = useState({ tipo: 'TALLER_IMPRESION', persona: '', descripcion: '', dia: '', cantidad: '', unidad: '', minutos: '' });
  const [cargando, setCargando] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    if (!abierto) return;
    obtenerPersonasAsignables().then(setAsignables).catch(() => setAsignables([]));
    setF({
      tipo: tarea?.tipo ?? 'TALLER_IMPRESION', persona: tarea?.persona_asignada_id ?? '', descripcion: tarea?.descripcion ?? '',
      dia: tarea?.fecha_trabajo ?? '', cantidad: tarea?.cantidad != null ? String(tarea.cantidad).replace('.', ',') : '',
      unidad: tarea?.unidad ?? '', minutos: tarea?.minutos_estimados ? String(tarea.minutos_estimados) : '',
    });
  }, [abierto, tarea]);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.descripcion.trim()) return toast.error('Escribí qué hay que hacer');
    const cantidad = opcional(f.cantidad) ? numero(f.cantidad) : null;
    const minutos = opcional(f.minutos) ? Math.round(numero(f.minutos)) : null;
    if (cantidad !== null && !(cantidad > 0)) return toast.error('La cantidad tiene que ser mayor a 0');
    if (minutos !== null && !(minutos > 0)) return toast.error('El tiempo estimado va en minutos, mayor a 0');
    setCargando(true);
    try {
      const plan = { fechaTrabajo: opcional(f.dia), cantidad, unidad: opcional(f.unidad), minutosEstimados: minutos };
      if (tarea) {
        await editarTarea(tarea.id, { descripcion: f.descripcion.trim(), personaAsignadaId: f.persona || null, ...plan, updatedAt: tarea.updated_at });
      } else {
        const sinNulos = Object.fromEntries(Object.entries(plan).filter(([, v]) => v !== null));
        await crearTareaOT(otId, { tipo: f.tipo, descripcion: f.descripcion.trim(), personaAsignadaId: f.persona || undefined, ...sinNulos });
      }
      toast.success(tarea ? 'Tarea actualizada.' : 'Tarea agregada a la hoja de ruta.');
      onGuardada();
      onCerrar();
    } catch (err) {
      toast.error(mensajeDeError(err, 'No se pudo guardar la tarea'));
    } finally {
      setCargando(false);
    }
  };

  return (
    <Dialog abierto={abierto} onCerrar={onCerrar}>
      <DialogHeader>
        <DialogTitle>{tarea ? 'Editar tarea' : 'Agregar Tarea'}</DialogTitle>
        <DialogDescription>Qué tiene que hacer cada operario y qué día. Le aparece en "Mi trabajo" cuando la hoja está activa.</DialogDescription>
      </DialogHeader>
      <form onSubmit={guardar} className="space-y-3">
        {!tarea && (
          <div><Label htmlFor="th-tipo">Tipo de Tarea *</Label>
            <select id="th-tipo" className={selectCls} value={f.tipo} onChange={set('tipo')}><OpcionesProceso /></select></div>
        )}
        <div><Label htmlFor="th-persona">Operario</Label>
          <select id="th-persona" className={selectCls} value={f.persona} onChange={set('persona')}>
            <option value="">(Sin asignar)</option>
            {asignables.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select></div>
        <div><Label htmlFor="th-desc">Qué hay que hacer *</Label>
          <textarea id="th-desc" rows={2} className={`${selectCls} h-auto py-2`} value={f.descripcion} onChange={set('descripcion')} placeholder="Ej: Imprimir lona 3×1 con ojales" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label htmlFor="th-dia">Día</Label><Input id="th-dia" type="date" value={f.dia} onChange={set('dia')} /></div>
          <div><Label htmlFor="th-min">Tiempo estimado (min)</Label><Input id="th-min" inputMode="numeric" value={f.minutos} onChange={set('minutos')} placeholder="Ej: 90" /></div>
          <div><Label htmlFor="th-cant">Cantidad</Label><Input id="th-cant" inputMode="decimal" value={f.cantidad} onChange={set('cantidad')} placeholder="Ej: 3" /></div>
          <div><Label htmlFor="th-uni">Unidad</Label><Input id="th-uni" value={f.unidad} onChange={set('unidad')} placeholder="m2, u, ml…" maxLength={20} /></div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar} disabled={cargando}>Volver</Button>
          <Button type="submit" disabled={cargando}>{cargando ? 'Guardando…' : tarea ? 'Guardar' : 'Agregar'}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
