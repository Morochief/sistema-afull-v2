import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileCheck2 } from 'lucide-react';
import { fijarRemision, obtenerEntregas, type EntregaOT } from '../../lib/api-entrega.js';
import { BASE_SESION, listarArchivos, llamadorSesion } from '../../lib/api-archivos.js';
import { mensajeDeError } from '../../lib/api.js';
import { formatearFechaHora } from '../../lib/fechas.js';

/** La foto de la remisión firmada de una parada (se abre en grande en otra pestaña). */
function FotoRemision({ e }: { e: EntregaOT }) {
  const { data } = useQuery({
    queryKey: ['archivos', 'remision', e.parada_id],
    queryFn: () => listarArchivos(llamadorSesion, BASE_SESION, { paradaId: e.parada_id }),
    enabled: !!e.remision_archivo_id,
  });
  const foto = data?.find((a) => a.id === e.remision_archivo_id);
  if (e.remision_por_llegar) return <p className="text-amber-300">La foto de la remisión todavía no llegó (está en el celular de la cuadrilla).</p>;
  if (!foto) return null;
  return (
    <a href={foto.url} target="_blank" rel="noopener noreferrer" aria-label={`Remisión firmada ${e.receptor_nombre}`}>
      <img src={foto.url} alt="Remisión firmada" className="h-24 w-24 rounded border border-[#1f2937] object-cover" />
    </a>
  );
}

/** Loop 17: quién recibió, cuándo y la remisión firmada; y "esta OT no lleva remisión". */
export function SeccionEntregaOT({ otId }: { otId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['ot', otId, 'entregas'], queryFn: () => obtenerEntregas(otId) });
  if (!data) return null;
  const cambiar = async (lleva: boolean) => {
    try {
      await fijarRemision(otId, lleva);
      void qc.invalidateQueries({ queryKey: ['ot', otId, 'entregas'] });
      toast.success(lleva ? 'Las próximas entregas piden la remisión firmada.' : 'Las próximas entregas de esta OT no piden remisión.');
    } catch (e) {
      toast.error(mensajeDeError(e, 'No se pudo cambiar'));
    }
  };
  return (
    <section className="space-y-3 rounded-md border border-[#1f2937] bg-[#111318] p-4 text-xs" data-testid="seccion-entrega">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-white"><FileCheck2 className="h-4 w-4" /> Entrega</h2>
        <label className="flex items-center gap-1.5 text-neutral-400">
          <input type="checkbox" checked={!data.lleva_remision} onChange={(e) => void cambiar(!e.target.checked)} /> Esta OT no lleva remisión
        </label>
      </div>
      {data.entregas.length === 0 ? (
        <p className="text-neutral-500">Todavía no se entregó.</p>
      ) : (
        <ul className="space-y-3">
          {data.entregas.map((e) => (
            <li key={e.parada_id} className="flex gap-3">
              <FotoRemision e={e} />
              <div className="space-y-0.5">
                <div className="text-sm text-white">Recibió: <strong>{e.receptor_nombre}</strong>{e.receptor_cargo && ` (${e.receptor_cargo})`}</div>
                <div className="text-neutral-400">{formatearFechaHora(e.entregada_at)}{e.completada_por && ` · cargó ${e.completada_por}`}</div>
                {e.sin_senal && <div className="text-amber-300">Cargada sin señal (la hora es la del celular)</div>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
