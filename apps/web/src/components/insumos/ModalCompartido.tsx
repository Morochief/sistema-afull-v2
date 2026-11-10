import { useState } from 'react';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { obtenerMiTrabajo } from '../../lib/api-cronometro.js';
import { cargarCompartido, UNIDAD_CORTA, type Insumo } from '../../lib/api-insumos.js';
import { numero } from '../../lib/numero.js';
import { mensajeDeError } from '../../lib/api.js';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';
import { Label } from '../ui/label.js';
import { BuscadorInsumo } from './BuscadorInsumo.js';

/**
 * Plancha o bobina compartida entre varias OTs: se carga la cantidad total usada y los m² de piezas de cada OT;
 * el servidor reparte en proporción (Σ exacta). Las OTs salen de las tareas asignadas a quien carga.
 */
export function ModalCompartido({ onCerrar }: { onCerrar: () => void }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['mi-trabajo'], queryFn: obtenerMiTrabajo });
  const ots = [...new Map((data?.tareas ?? []).map((t) => [t.orden_trabajo_id, t])).values()];
  const [insumo, setInsumo] = useState<Insumo | null>(null);
  const [total, setTotal] = useState('');
  const [m2, setM2] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(false);
  const repartos = Object.entries(m2).map(([otId, v]) => ({ otId, m2Piezas: numero(v) })).filter((x) => x.m2Piezas > 0);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!insumo || !(numero(total) > 0) || repartos.length < 2) return toast.error('Elegí el material, la cantidad total y al menos 2 OTs con sus m²');
    setCargando(true);
    try {
      const r = await cargarCompartido({ insumoId: insumo.id, cantidadTotal: numero(total), repartos, claveIdempotencia: crypto.randomUUID() });
      toast.success(`Repartido: ${r.partes.join(' / ')} ${UNIDAD_CORTA[insumo.unidad]}.`);
      void qc.invalidateQueries({ queryKey: ['consumos'] });
      onCerrar();
    } catch (er) {
      toast.error(mensajeDeError(er, 'No se pudo repartir'));
    } finally {
      setCargando(false);
    }
  };

  return (
    <Dialog abierto onCerrar={onCerrar}>
      <DialogHeader>
        <DialogTitle>Material compartido entre OTs</DialogTitle>
        <DialogDescription>Ej. una plancha de acrílico con piezas de varios clientes: cada OT paga según sus m².</DialogDescription>
      </DialogHeader>
      <form onSubmit={guardar} className="space-y-3 text-xs">
        <BuscadorInsumo id="compartidoMaterial" valor={insumo} onElegir={setInsumo} />
        <div><Label htmlFor="compartidoTotal">Cantidad total usada {insumo && `(${UNIDAD_CORTA[insumo.unidad]})`}</Label><Input id="compartidoTotal" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} /></div>
        <Label>m² de piezas de cada OT (dejá vacío si no participa)</Label>
        {ots.length === 0 && <p className="text-neutral-500">No tenés OTs asignadas.</p>}
        {ots.map((t) => (
          <div key={t.orden_trabajo_id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-neutral-200">{t.codigo_ot} · {t.cliente_nombre}</span>
            {/* Input se envuelve en un div w-full: sin este contenedor fijo, aplasta el nombre de la OT a 0 px. */}
            <div className="w-24 shrink-0">
              <Input aria-label={`m² ${t.codigo_ot}`} inputMode="decimal" placeholder="m²" value={m2[t.orden_trabajo_id] ?? ''} onChange={(e) => setM2({ ...m2, [t.orden_trabajo_id]: e.target.value })} />
            </div>
          </div>
        ))}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar} disabled={cargando}>Volver</Button>
          <Button type="submit" disabled={cargando}>{cargando ? 'Repartiendo…' : 'Repartir y cargar'}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
