import { useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { calcularCorte, type MiTrabajoTarea, type ResultadoCorte } from '@afull/shared';
import { cargarCorte, type Insumo } from '../../lib/api-insumos.js';
import { numero } from '../../lib/numero.js';
import { mensajeDeError } from '../../lib/api.js';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';
import { Label } from '../ui/label.js';
import { BuscadorInsumo } from './BuscadorInsumo.js';
import { TrabajoCorte, PIEZA_VACIA, type FilaTrabajo } from './TrabajoCorte.js';

/** Anchos de rollo más usados en el taller (reunión del 10/11). */
const ANCHOS_COMUNES = ['137', '152'];
const coma = (n: number) => String(n).replace('.', ',');

/** Trabajos posibles: las OTs de sus tareas y las de su tanda en marcha (una fila por OT). */
function opciones(tareas: MiTrabajoTarea[]) {
  const m = new Map<string, FilaTrabajo>();
  for (const t of tareas) {
    for (const x of t.tanda?.tareas ?? []) {
      if (!m.has(x.orden_trabajo_id)) m.set(x.orden_trabajo_id, { otId: x.orden_trabajo_id, tareaId: x.tarea_id, codigo: x.codigo_ot, etiqueta: `${x.codigo_ot} · ${x.cliente_nombre}`, piezas: [{ ...PIEZA_VACIA }] });
    }
    if (!m.has(t.orden_trabajo_id)) m.set(t.orden_trabajo_id, { otId: t.orden_trabajo_id, tareaId: t.id, codigo: t.codigo_ot, etiqueta: `${t.codigo_ot} · ${t.cliente_nombre}`, piezas: [{ ...PIEZA_VACIA }] });
  }
  return m;
}

/**
 * Medidas en cm (Loop 18): Edu carga la medida total del material (ej. 137 × 691) y las piezas de cada trabajo;
 * el sistema calcula el desperdicio y lo reparte entre las OTs según sus m². Reemplaza a Merma y Compartido.
 */
export function ModalCorte({ origen, tareas, onCerrar }: { origen: MiTrabajoTarea; tareas: MiTrabajoTarea[]; onCerrar: () => void }) {
  const qc = useQueryClient();
  const todas = opciones([origen, ...tareas]);
  const iniciales = origen.tanda ? origen.tanda.tareas.map((x) => todas.get(x.orden_trabajo_id)!) : [todas.get(origen.orden_trabajo_id)!];
  const [trabajos, setTrabajos] = useState<FilaTrabajo[]>(iniciales);
  const [insumo, setInsumo] = useState<Insumo | null>(null);
  const [desp, setDesp] = useState<Insumo | null>(null);
  const [ancho, setAncho] = useState('');
  const [largo, setLargo] = useState('');
  const [cargando, setCargando] = useState(false);

  const datos = trabajos.map((t) => ({ otId: t.otId, tareaId: t.tareaId, piezas: t.piezas.map((p) => ({ anchoCm: numero(p.ancho), altoCm: numero(p.alto), cantidad: Number(p.cantidad) })) }));
  const completo = numero(ancho) > 0 && numero(largo) > 0 && datos.every((t) => t.piezas.every((p) => p.anchoCm > 0 && p.altoCm > 0 && Number.isInteger(p.cantidad) && p.cantidad >= 1));
  let r: ResultadoCorte | null = null;
  let aviso: string | null = null;
  try {
    if (completo) r = calcularCorte(numero(ancho), numero(largo), datos);
  } catch (e) {
    aviso = (e as Error).message;
  }
  const libres = [...todas.values()].filter((o) => !trabajos.some((t) => t.otId === o.otId));

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!insumo || !r) return;
    setCargando(true);
    try {
      const res = await cargarCorte({ insumoId: insumo.id, insumoDesperdicioId: desp?.id, anchoCm: numero(ancho), largoCm: numero(largo), trabajos: datos, claveIdempotencia: crypto.randomUUID() });
      toast.success(`Cargado: ${coma(res.m2Piezas)} m² de piezas y ${coma(res.m2Desperdicio)} m² de desperdicio (${coma(res.aprovechamientoPct)} % aprovechado).`);
      for (const t of trabajos) void qc.invalidateQueries({ queryKey: ['consumos', t.otId] });
      onCerrar();
    } catch (er) {
      toast.error(mensajeDeError(er, 'No se pudo cargar'));
    } finally {
      setCargando(false);
    }
  };

  return (
    <Dialog abierto onCerrar={onCerrar}>
      <DialogHeader>
        <DialogTitle>Medidas del material (cm)</DialogTitle>
        <DialogDescription>Medida total del material que usaste y las piezas de cada trabajo. El desperdicio se calcula y se reparte solo.</DialogDescription>
      </DialogHeader>
      <form onSubmit={guardar} className="space-y-3 text-xs">
        <BuscadorInsumo id="corteMaterial" valor={insumo} onElegir={setInsumo} placeholder="Material (ej. Adhesivo, Lona)…" />
        <BuscadorInsumo valor={desp} onElegir={setDesp} placeholder="Desperdicio con otro precio (opcional)…" />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="corteAncho">Ancho del material (cm)</Label>
            <Input id="corteAncho" inputMode="decimal" value={ancho} onChange={(e) => setAncho(e.target.value)} />
            <div className="mt-1 flex gap-1">
              {ANCHOS_COMUNES.map((a) => <Button key={a} type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setAncho(a)}>{a}</Button>)}
            </div>
          </div>
          <div><Label htmlFor="corteLargo">Largo usado (cm)</Label><Input id="corteLargo" inputMode="decimal" value={largo} onChange={(e) => setLargo(e.target.value)} /></div>
        </div>
        <Label>Piezas de cada trabajo: ancho × alto (cm) × cantidad</Label>
        {trabajos.map((t, i) => (
          <TrabajoCorte key={t.otId} t={t}
            parte={r ? `${coma(r.porTrabajo[i].m2Piezas)} m² + ${coma(r.porTrabajo[i].m2Desperdicio)} m² desperdicio` : null}
            onCambiar={(n) => setTrabajos(trabajos.map((x, j) => (j === i ? n : x)))}
            onQuitar={trabajos.length > 1 ? () => setTrabajos(trabajos.filter((_, j) => j !== i)) : undefined} />
        ))}
        {libres.length > 0 && (
          <select aria-label="Agregar otro trabajo" value="" className="h-9 w-full rounded border border-[#1f2937] bg-[#111318] px-2 text-xs text-neutral-200"
            onChange={(e) => { const o = todas.get(e.target.value); if (o) setTrabajos([...trabajos, o]); }}>
            <option value="">+ Agregar otro trabajo…</option>
            {libres.map((o) => <option key={o.otId} value={o.otId}>{o.etiqueta}</option>)}
          </select>
        )}
        {aviso && <p className="text-red-400">{aviso}</p>}
        {r && (
          <div className="grid grid-cols-4 gap-2 rounded border border-[#1f2937] bg-[#090a0f] p-2 text-center" data-testid="resumen-corte">
            <div><div className="text-neutral-500">Material</div><div className="font-mono text-white">{coma(r.m2Usados)} m²</div></div>
            <div><div className="text-neutral-500">Piezas</div><div className="font-mono text-white">{coma(r.m2Piezas)} m²</div></div>
            <div><div className="text-neutral-500">Desperdicio</div><div className="font-mono text-amber-400">{coma(r.m2Desperdicio)} m²</div></div>
            <div><div className="text-neutral-500">Aprovechado</div><div className="font-mono text-[#ea580c]">{coma(r.aprovechamientoPct)} %</div></div>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar} disabled={cargando}>Volver</Button>
          <Button type="submit" disabled={cargando || !insumo || !r}>{cargando ? 'Cargando…' : 'Cargar'}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
