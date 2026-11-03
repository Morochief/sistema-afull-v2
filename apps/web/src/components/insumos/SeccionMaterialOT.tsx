import { useState } from 'react';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Package, Ruler } from 'lucide-react';
import { consumosDeOT, anularConsumo, UNIDAD_CORTA, type ConsumoFila } from '../../lib/api-insumos.js';
import { mensajeDeError } from '../../lib/api.js';
import { formatearFechaHora } from '../../lib/fechas.js';
import { formatearGs } from '../../lib/formato.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';
import { ModalCargarMaterial } from './ModalCargarMaterial.js';
import { ModalMerma } from './ModalMerma.js';

const cant = (n: number) => n.toLocaleString('es-PY', { maximumFractionDigits: 4 });

/** Material usado en la OT: líneas inmutables, total y desperdicio. Un error se corrige con una línea negativa y motivo. */
export function SeccionMaterialOT({ otId, otFinalizada }: { otId: string; otFinalizada: boolean }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['consumos', otId], queryFn: () => consumosDeOT(otId) });
  const [modal, setModal] = useState<'material' | 'merma' | null>(null);
  const [anulando, setAnulando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');

  const anular = async (f: ConsumoFila) => {
    try {
      await anularConsumo(f.id, motivo.trim());
      toast.success('Línea corregida: se cargó el negativo.');
      setAnulando(null);
      setMotivo('');
      void qc.invalidateQueries({ queryKey: ['consumos', otId] });
    } catch (e) {
      toast.error(mensajeDeError(e, 'No se pudo corregir'));
    }
  };

  const items = data?.items ?? [];
  return (
    <div className="space-y-3 rounded-md border border-[#1f2937] bg-[#111318] p-4" data-testid="seccion-material">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Material usado</h2>
        {!otFinalizada && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => setModal('material')}><Package className="h-3.5 w-3.5" /> Cargar material</Button>
            <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => setModal('merma')}><Ruler className="h-3.5 w-3.5" /> Merma</Button>
          </div>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-neutral-500">Todavía no se cargó material.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-neutral-500">
              <tr><th className="py-1">Material</th><th>Cantidad</th><th className="text-right">Costo</th><th>Quién</th><th></th></tr>
            </thead>
            <tbody>
              {items.map((f) => (
                <tr key={f.id} className={`border-t border-[#1f2937] ${f.corregido || f.cantidad < 0 ? 'text-neutral-500' : 'text-neutral-200'}`}>
                  <td className="py-1.5">
                    {f.insumo}
                    {f.es_desperdicio && <span className="ml-1 rounded bg-amber-500/10 px-1 text-[10px] text-amber-400">desperdicio</span>}
                    {f.cantidad < 0 && <span className="ml-1 text-[10px]">(corrección{f.nota ? `: ${f.nota}` : ''})</span>}
                    {f.tarea && <div className="text-[10px] text-neutral-500">{f.tarea}</div>}
                  </td>
                  <td className="font-mono">{cant(f.cantidad)} {UNIDAD_CORTA[f.unidad]}</td>
                  <td className="text-right font-mono">{formatearGs(f.total_gs)}</td>
                  <td className="text-neutral-400">{f.persona ?? f.cargado_por}<div className="text-[10px] text-neutral-500">{formatearFechaHora(f.created_at)}</div></td>
                  <td className="text-right">
                    {!otFinalizada && !f.corregido && f.cantidad > 0 && anulando !== f.id && (
                      <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setAnulando(f.id)}>Corregir</Button>
                    )}
                    {anulando === f.id && (
                      <div className="flex justify-end gap-1">
                        <Input aria-label="Motivo de la corrección" className="h-7 w-40 text-xs" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo" />
                        <Button size="sm" className="h-7 text-[11px]" disabled={motivo.trim().length < 3} onClick={() => void anular(f)}>Anular</Button>
                        <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setAnulando(null)}>×</Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 flex justify-end gap-6 border-t border-[#1f2937] pt-2 text-xs">
            <span className="text-neutral-400">Desperdicio: <span className="font-mono text-amber-400">{formatearGs(data?.desperdicio_gs ?? 0)}</span></span>
            <span className="text-neutral-400">Total material: <span className="font-mono text-white" data-testid="total-material">{formatearGs(data?.total_gs ?? 0)}</span></span>
          </div>
        </div>
      )}
      {modal === 'material' && <ModalCargarMaterial otId={otId} onCerrar={() => setModal(null)} />}
      {modal === 'merma' && <ModalMerma otId={otId} onCerrar={() => setModal(null)} />}
    </div>
  );
}
