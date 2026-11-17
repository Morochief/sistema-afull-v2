import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2 } from 'lucide-react';
import type { ParadaHoy } from '../../lib/api-campo.js';
import { enviarOEncolar } from '../../lib/cola-offline.js';
import { guardarFoto } from '../../lib/fotos-pendientes.js';
import { useFotosPendientes } from '../../hooks/useFotosPendientes.js';
import { mensajeDeError } from '../../lib/api.js';
import { BotonFoto } from '../archivos/BotonFoto.js';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';
import { Label } from '../ui/label.js';

/**
 * Loop 17: "Hecha" con la constancia de entrega: foto de la remisión firmada (si la OT la lleva), quién recibió y su cargo.
 * La foto va por la cola de fotos y el "Hecha" por la de acciones: si la foto todavía no subió, se avisa (remisionEnCelular).
 */
export function ModalEntregaParada({ parada, onCerrar, onHecha }: { parada: ParadaHoy | null; onCerrar: () => void; onHecha: (hojaTerminada: boolean) => void }) {
  const [nombre, setNombre] = useState('');
  const [cargo, setCargo] = useState('');
  const [sacada, setSacada] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const { porSubir } = useFotosPendientes(parada ? { paradaId: parada.id } : { paradaId: '-' });
  useEffect(() => { if (parada) { setNombre(''); setCargo(''); setSacada(false); } }, [parada]);
  const lleva = parada?.lleva_remision !== false;
  const remisionEnCelular = porSubir.some((f) => f.tipo === 'REMISION_PARADA');

  const foto = async (a: { blob: Blob; mime: string }) => {
    if (!parada) return;
    await guardarFoto({ etiqueta: `Remisión firmada ${parada.codigo_ot}`, tipo: 'REMISION_PARADA', ref: { paradaId: parada.id }, ...a });
    setSacada(true);
  };
  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parada) return;
    if (nombre.trim().length < 2) return toast.error('Escribí el nombre de quien recibió');
    if (lleva && !sacada && !remisionEnCelular) return toast.error('Sacale una foto a la remisión firmada');
    setEnviando(true);
    try {
      const envio = await enviarOEncolar<{ hoja_finalizada?: boolean }>(`Parada hecha: ${parada.codigo_ot}`, `/api/campo/paradas/${parada.id}/completar`, {
        receptorNombre: nombre.trim(), ...(cargo.trim() ? { receptorCargo: cargo.trim() } : {}), remisionEnCelular: lleva && remisionEnCelular,
      });
      if (envio.encolada) toast.info('Entrega guardada sin señal: se envía sola cuando vuelva (con la hora de ahora).');
      else toast.success(`Entregado. Recibió ${nombre.trim()}.`);
      onHecha(!envio.encolada && !!envio.respuesta.hoja_finalizada);
    } catch (err) {
      toast.error(mensajeDeError(err, 'No se pudo cerrar la parada'));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog abierto={!!parada} onCerrar={onCerrar}>
      <DialogHeader>
        <DialogTitle>Entrega · {parada?.codigo_ot}</DialogTitle>
        <DialogDescription>{parada?.cliente}{parada?.sucursal ? ` · ${parada.sucursal}` : ''}</DialogDescription>
      </DialogHeader>
      <form onSubmit={confirmar} className="space-y-3 text-xs">
        {lleva ? (
          <div className="flex items-center gap-2">
            <BotonFoto etiqueta="Foto de la remisión firmada" onArchivo={foto} className="min-h-[40px] gap-1 text-xs" variant="outline" />
            {(sacada || remisionEnCelular) && <span className="flex items-center gap-1 text-[#22c55e]"><CheckCircle2 className="h-3.5 w-3.5" /> Foto lista</span>}
          </div>
        ) : <p className="text-neutral-400">Esta OT no lleva remisión.</p>}
        <div><Label htmlFor="ent-nombre">Recibió (nombre) *</Label><Input id="ent-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} placeholder="Ej: María Gómez" /></div>
        <div><Label htmlFor="ent-cargo">Cargo</Label><Input id="ent-cargo" value={cargo} onChange={(e) => setCargo(e.target.value)} maxLength={60} placeholder="Ej: encargada, cajera" /></div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar} disabled={enviando}>Volver</Button>
          <Button type="submit" disabled={enviando}>{enviando ? 'Enviando…' : 'Confirmar entrega'}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
