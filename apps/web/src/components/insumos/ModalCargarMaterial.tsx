import { useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { UNIDAD_CORTA, type Insumo } from '../../lib/api-insumos.js';
import { enviarOEncolar } from '../../lib/cola-offline.js';
import { numero } from '../../lib/numero.js';
import { mensajeDeError } from '../../lib/api.js';
import { formatearGs } from '../../lib/formato.js';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';
import { Label } from '../ui/label.js';
import { BuscadorInsumo } from './BuscadorInsumo.js';

type Props = { otId: string | null; tareaId?: string; titulo?: string; onCerrar: () => void };

/** Cargar material usado en una OT (cualquier operario). El costo vigente queda congelado en el servidor. */
export function ModalCargarMaterial({ otId, tareaId, titulo, onCerrar }: Props) {
  const qc = useQueryClient();
  const [insumo, setInsumo] = useState<Insumo | null>(null);
  const [cantidad, setCantidad] = useState('');
  const [desperdicio, setDesperdicio] = useState(false);
  const [nota, setNota] = useState('');
  const [cargando, setCargando] = useState(false);
  if (!otId) return null;
  const cant = numero(cantidad);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!insumo) return toast.error('Elegí el material');
    if (!(cant > 0)) return toast.error('Cantidad mayor a 0, hasta 4 decimales');
    setCargando(true);
    try {
      const texto = `${cantidad} ${UNIDAD_CORTA[insumo.unidad]} de ${insumo.nombre}`;
      const envio = await enviarOEncolar(`Material: ${texto}`, '/api/consumos', { otId, tareaId, insumoId: insumo.id, cantidad: cant, esDesperdicio: desperdicio, nota: nota.trim() || undefined, claveIdempotencia: crypto.randomUUID() });
      toast.success(envio.encolada ? `Guardado sin señal: ${texto}. Se envía solo.` : `Cargado: ${texto}.`);
      void qc.invalidateQueries({ queryKey: ['consumos', otId] });
      setInsumo(null);
      setCantidad('');
      setNota('');
      setDesperdicio(false);
    } catch (er) {
      toast.error(mensajeDeError(er, 'No se pudo cargar el material'));
    } finally {
      setCargando(false);
    }
  };

  return (
    <Dialog abierto onCerrar={onCerrar}>
      <DialogHeader>
        <DialogTitle>Cargar material</DialogTitle>
        <DialogDescription>{titulo ?? 'Lo que usaste en esta OT. Podés cargar varios seguidos.'}</DialogDescription>
      </DialogHeader>
      <form onSubmit={guardar} className="space-y-3">
        <BuscadorInsumo id="materialBuscar" valor={insumo} onElegir={setInsumo} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="materialCantidad">Cantidad {insumo && `(${UNIDAD_CORTA[insumo.unidad]})`}</Label>
            <Input id="materialCantidad" inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
          </div>
          <label className="flex items-end gap-2 pb-2 text-xs text-neutral-300">
            <input type="checkbox" checked={desperdicio} onChange={(e) => setDesperdicio(e.target.checked)} /> Es desperdicio
          </label>
        </div>
        <Input aria-label="Nota" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota (opcional)" maxLength={500} />
        {insumo && cant > 0 && insumo.costo_unitario_gs !== null && (
          <p className="text-xs text-neutral-400">Costo aproximado: {formatearGs(Math.round(cant * insumo.costo_unitario_gs))}</p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar} disabled={cargando}>Listo</Button>
          <Button type="submit" disabled={cargando || !insumo}>{cargando ? 'Cargando…' : 'Cargar'}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
