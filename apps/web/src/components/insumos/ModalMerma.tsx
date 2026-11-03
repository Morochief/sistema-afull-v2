import { useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { calcularMerma, type ResultadoMerma } from '@afull/shared';
import { cargarMerma, type Insumo } from '../../lib/api-insumos.js';
import { numero } from '../../lib/numero.js';
import { mensajeDeError } from '../../lib/api.js';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';
import { Label } from '../ui/label.js';
import { BuscadorInsumo } from './BuscadorInsumo.js';

type Props = { otId: string | null; tareaId?: string; onCerrar: () => void };
type FilaPieza = { ancho: string; alto: string; cantidad: string };

/** Calculadora de merma (REQ-04): Edu carga ancho del material, largo usado y piezas; el sistema hace las cuentas. */
export function ModalMerma({ otId, tareaId, onCerrar }: Props) {
  const qc = useQueryClient();
  const [insumo, setInsumo] = useState<Insumo | null>(null);
  const [desp, setDesp] = useState<Insumo | null>(null);
  const [ancho, setAncho] = useState('');
  const [largo, setLargo] = useState('');
  const [piezas, setPiezas] = useState<FilaPieza[]>([{ ancho: '', alto: '', cantidad: '1' }]);
  const [cargando, setCargando] = useState(false);
  if (!otId) return null;

  const datos = piezas.map((p) => ({ anchoM: numero(p.ancho), altoM: numero(p.alto), cantidad: Number(p.cantidad) }));
  let r: ResultadoMerma | null = null;
  let aviso: string | null = null;
  try {
    if (numero(ancho) > 0 && numero(largo) > 0 && datos.every((p) => p.anchoM > 0 && p.altoM > 0 && p.cantidad >= 1)) r = calcularMerma(numero(ancho), numero(largo), datos);
  } catch (e) {
    aviso = (e as Error).message;
  }
  const cambiar = (i: number, k: keyof FilaPieza, v: string) => setPiezas(piezas.map((p, j) => (j === i ? { ...p, [k]: v } : p)));

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!insumo || !r) return;
    setCargando(true);
    try {
      const res = await cargarMerma({ otId, tareaId, insumoId: insumo.id, insumoDesperdicioId: desp?.id, anchoMaterialM: numero(ancho), largoUsadoM: numero(largo), piezas: datos, claveIdempotencia: crypto.randomUUID() });
      toast.success(`Cargado: ${res.m2Piezas} m² de piezas y ${res.m2Desperdicio} m² de desperdicio (${res.aprovechamientoPct} % aprovechado).`);
      void qc.invalidateQueries({ queryKey: ['consumos', otId] });
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
        <DialogTitle>Merma de impresión o corte</DialogTitle>
        <DialogDescription>Medidas en metros (ej. 1,52). El sistema calcula el aprovechamiento y carga las dos líneas.</DialogDescription>
      </DialogHeader>
      <form onSubmit={guardar} className="space-y-3 text-xs">
        <BuscadorInsumo id="mermaMaterial" valor={insumo} onElegir={setInsumo} placeholder="Material (ej. Adhesivo impreso)…" />
        <BuscadorInsumo valor={desp} onElegir={setDesp} placeholder="Desperdicio con otro precio (opcional)…" />
        <div className="grid grid-cols-2 gap-2">
          <div><Label htmlFor="mermaAncho">Ancho del material (m)</Label><Input id="mermaAncho" inputMode="decimal" value={ancho} onChange={(e) => setAncho(e.target.value)} /></div>
          <div><Label htmlFor="mermaLargo">Largo usado (m)</Label><Input id="mermaLargo" inputMode="decimal" value={largo} onChange={(e) => setLargo(e.target.value)} /></div>
        </div>
        <Label>Piezas (ancho × alto × cantidad)</Label>
        {piezas.map((p, i) => (
          <div key={i} className="flex gap-2">
            <Input aria-label={`Ancho pieza ${i + 1}`} inputMode="decimal" value={p.ancho} onChange={(e) => cambiar(i, 'ancho', e.target.value)} placeholder="Ancho" />
            <Input aria-label={`Alto pieza ${i + 1}`} inputMode="decimal" value={p.alto} onChange={(e) => cambiar(i, 'alto', e.target.value)} placeholder="Alto" />
            <Input aria-label={`Cantidad pieza ${i + 1}`} inputMode="numeric" value={p.cantidad} onChange={(e) => cambiar(i, 'cantidad', e.target.value)} className="w-20" />
            {piezas.length > 1 && <Button type="button" variant="ghost" size="sm" onClick={() => setPiezas(piezas.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" /></Button>}
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => setPiezas([...piezas, { ancho: '', alto: '', cantidad: '1' }])}><Plus className="h-3.5 w-3.5" /> Otra pieza</Button>
        {aviso && <p className="text-red-400">{aviso}</p>}
        {r && (
          <div className="grid grid-cols-4 gap-2 rounded border border-[#1f2937] bg-[#090a0f] p-2 text-center" data-testid="resultado-merma">
            <div><div className="text-neutral-500">Usado</div><div className="font-mono text-white">{r.m2Usados} m²</div></div>
            <div><div className="text-neutral-500">Piezas</div><div className="font-mono text-white">{r.m2Piezas} m²</div></div>
            <div><div className="text-neutral-500">Desperdicio</div><div className="font-mono text-amber-400">{r.m2Desperdicio} m²</div></div>
            <div><div className="text-neutral-500">Aprovechado</div><div className="font-mono text-[#ea580c]">{r.aprovechamientoPct} %</div></div>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar} disabled={cargando}>Volver</Button>
          <Button type="submit" disabled={cargando || !insumo || !r}>{cargando ? 'Cargando…' : 'Cargar consumo'}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
