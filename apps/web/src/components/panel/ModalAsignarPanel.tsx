import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { OTDetalle } from '@afull/shared';
import { obtenerOT, obtenerOTs } from '../../lib/api-ots.js';
import { accionHojaOT, crearTareaOT } from '../../lib/api-tareas.js';
import { hoyAsuncion } from '../../lib/api-panel.js';
import { mensajeDeError } from '../../lib/api.js';
import { numero } from '../../lib/numero.js';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';
import { Label } from '../ui/label.js';
import { OpcionesProceso } from '../procesos/OpcionesProceso.js';
import { SelectorBuscar, type Opcion } from '../reportes/SelectorBuscar.js';

const selectCls = 'flex h-9 w-full rounded-md border border-[#1f2937] bg-[#161922] px-3 py-1 text-xs text-neutral-200';
const FINALES = ['TERMINADO', 'CANCELADO'];
const buscarOTs = async (q: string): Promise<Opcion[]> =>
  (await obtenerOTs({ q, pagina: 1 })).items
    .filter((o) => !FINALES.includes(o.estado))
    .map((o) => ({ id: o.id, texto: `${o.codigo_ot} · ${o.cliente_nombre} · ${o.titulo}` }));
const vacio = () => ({ tipo: 'TALLER_IMPRESION', descripcion: '', dia: hoyAsuncion(), minutos: '', cantidad: '', unidad: '' });

/** Loop 14: Gerardo le da una tarea a alguien desde el panel (el mismo alta de la hoja de ruta del Loop 11). */
export function ModalAsignarPanel({ persona, onCerrar }: { persona: { persona_id: string; nombre: string } | null; onCerrar: () => void }) {
  const qc = useQueryClient();
  const [ot, setOt] = useState<Opcion | null>(null);
  const [detalle, setDetalle] = useState<OTDetalle | null>(null);
  const [activar, setActivar] = useState(true);
  const [f, setF] = useState(vacio);
  const [cargando, setCargando] = useState(false);
  const set = (k: keyof ReturnType<typeof vacio>) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    if (persona) { setOt(null); setF(vacio()); setActivar(true); }
  }, [persona]);
  useEffect(() => {
    setDetalle(null);
    if (ot) obtenerOT(ot.id).then(setDetalle).catch(() => setDetalle(null));
  }, [ot]);

  const hoja = detalle?.hoja_estado;
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!persona || !ot) return toast.error('Elegí la OT');
    if (!f.descripcion.trim()) return toast.error('Escribí qué hay que hacer');
    const minutos = f.minutos.trim() ? Math.round(numero(f.minutos)) : null;
    const cantidad = f.cantidad.trim() ? numero(f.cantidad) : null;
    if (minutos !== null && !(minutos > 0)) return toast.error('El tiempo estimado va en minutos, mayor a 0');
    if (cantidad !== null && !(cantidad > 0)) return toast.error('La cantidad tiene que ser mayor a 0');
    setCargando(true);
    try {
      const plan = Object.fromEntries(Object.entries({ fechaTrabajo: f.dia || null, minutosEstimados: minutos, cantidad, unidad: f.unidad.trim() || null })
        .filter(([, v]) => v !== null));
      await crearTareaOT(ot.id, { tipo: f.tipo, descripcion: f.descripcion.trim(), personaAsignadaId: persona.persona_id, ...plan });
      const activada = hoja === 'BORRADOR' && activar;
      if (activada) await accionHojaOT(ot.id, 'ACTIVAR', 'BORRADOR');
      toast.success(hoja === 'BORRADOR' && !activada
        ? `Tarea asignada. ${persona.nombre} la va a ver cuando actives la hoja de ruta.`
        : `Tarea asignada: ${persona.nombre} ya la ve en Mi trabajo.`);
      void qc.invalidateQueries({ queryKey: ['panel'] });
      onCerrar();
    } catch (err) {
      toast.error(mensajeDeError(err, 'No se pudo asignar la tarea'));
    } finally {
      setCargando(false);
    }
  };

  return (
    <Dialog abierto={!!persona} onCerrar={onCerrar}>
      <DialogHeader>
        <DialogTitle>Asignar tarea a {persona?.nombre}</DialogTitle>
        <DialogDescription>Se agrega a la hoja de ruta de la OT y le aparece en "Mi trabajo".</DialogDescription>
      </DialogHeader>
      <form onSubmit={guardar} className="space-y-3">
        <SelectorBuscar etiqueta="OT" valor={ot} onCambio={setOt} buscar={buscarOTs} />
        {hoja === 'CERRADA' && <p className="text-xs text-red-400">La hoja de ruta de esta OT está cerrada: reabrila desde la OT para agregar tareas.</p>}
        {hoja === 'BORRADOR' && (
          <label className="flex items-center gap-2 text-xs text-neutral-300">
            <input type="checkbox" checked={activar} onChange={(e) => setActivar(e.target.checked)} />
            La hoja de esta OT está en borrador: activarla para que la vea ya
          </label>
        )}
        <div><Label htmlFor="ap-tipo">Tipo de tarea *</Label>
          <select id="ap-tipo" className={selectCls} value={f.tipo} onChange={set('tipo')}><OpcionesProceso /></select></div>
        <div><Label htmlFor="ap-desc">Qué hay que hacer *</Label>
          <textarea id="ap-desc" rows={2} className={`${selectCls} h-auto py-2`} value={f.descripcion} onChange={set('descripcion')} placeholder="Ej: Cortar vinilo para el local de Luque" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label htmlFor="ap-dia">Día</Label><Input id="ap-dia" type="date" value={f.dia} onChange={set('dia')} /></div>
          <div><Label htmlFor="ap-min">Tiempo estimado (min)</Label><Input id="ap-min" inputMode="numeric" value={f.minutos} onChange={set('minutos')} placeholder="Ej: 60" /></div>
          <div><Label htmlFor="ap-cant">Cantidad</Label><Input id="ap-cant" inputMode="decimal" value={f.cantidad} onChange={set('cantidad')} placeholder="Ej: 3" /></div>
          <div><Label htmlFor="ap-uni">Unidad</Label><Input id="ap-uni" value={f.unidad} onChange={set('unidad')} placeholder="m2, u, ml…" maxLength={20} /></div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar} disabled={cargando}>Volver</Button>
          <Button type="submit" disabled={cargando || !ot || hoja === 'CERRADA'}>{cargando ? 'Asignando…' : 'Asignar'}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
