import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import type { DisenoEnCola } from '@afull/shared';
import { disenosPorRevisar, colaProduccion } from '../lib/api-disenos.js';
import { useSesion } from '../hooks/useSesion.js';
import { formatearFechaHora } from '../lib/fechas.js';
import { Skeleton } from '../components/ui/skeleton.js';

function Fila({ d, conEnlaceOT, fecha }: { d: DisenoEnCola; conEnlaceOT: boolean; fecha: string | null }) {
  return (
    <div className="flex flex-col gap-1 border-b border-[#1f2937] py-3 text-xs last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-2">
          {conEnlaceOT ? (
            <Link to="/ots/$id" params={{ id: d.orden_trabajo_id }} className="font-mono font-semibold text-[#ea580c] hover:underline">{d.codigo_ot}</Link>
          ) : (
            <span className="font-mono font-semibold text-[#ea580c]">{d.codigo_ot}</span>
          )}
          <span className="font-medium text-white">{d.ot_titulo}</span>
          <span className="text-neutral-500">v{d.version}</span>
        </div>
        <div className="text-neutral-400">
          {d.cliente_nombre}{d.sucursal_nombre && ` · ${d.sucursal_nombre}`} · {d.origen === 'CLIENTE' ? 'diseño del cliente' : 'diseñadora'} · {formatearFechaHora(fecha)}
        </div>
        {d.notas && <div className="text-neutral-300">{d.notas}</div>}
      </div>
      <a href={d.drive_url} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md bg-[#ea580c] px-3 font-semibold text-white hover:bg-[#c2410c]">
        Abrir en Drive <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

/**
 * Diseños. Juan y Sofi ven "Por verificar" (se aprueban u observan desde la OT); Edu ve "Para producir":
 * solo lo aprobado, con el enlace al original. Se refresca cada 30 s y con los avisos en vivo.
 */
export function DisenosPage() {
  const { tieneCapacidad } = useSesion();
  const comercial = tieneCapacidad('comercial');
  const pend = useQuery({ queryKey: ['disenos', 'pendientes'], queryFn: disenosPorRevisar, enabled: comercial, refetchInterval: 30_000 });
  const cola = useQuery({ queryKey: ['disenos', 'cola'], queryFn: colaProduccion, refetchInterval: 30_000 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">Diseños</h1>
        <p className="text-xs text-neutral-400">Todo diseño, también el que trae el cliente, lo verifica Juan o Sofi antes de producir.</p>
      </div>
      {comercial && (
        <section className="rounded-md border border-[#1f2937] bg-[#111318] p-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">Por verificar ({pend.data?.length ?? 0})</h2>
          {pend.isLoading ? <Skeleton className="h-16 w-full" /> : (pend.data ?? []).length === 0 ? (
            <p className="py-3 text-center text-xs text-neutral-500">Nada pendiente.</p>
          ) : (
            (pend.data ?? []).map((d) => <Fila key={d.id} d={d} conEnlaceOT fecha={d.subido_at} />)
          )}
          {comercial && (pend.data ?? []).length > 0 && <p className="mt-2 text-[11px] text-neutral-500">Entrá a la OT para aprobar u observar.</p>}
        </section>
      )}
      <section className="rounded-md border border-[#1f2937] bg-[#111318] p-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">Para producir ({cola.data?.length ?? 0})</h2>
        {cola.isLoading ? <Skeleton className="h-16 w-full" /> : (cola.data ?? []).length === 0 ? (
          <p className="py-3 text-center text-xs text-neutral-500">No hay diseños aprobados esperando producción.</p>
        ) : (
          (cola.data ?? []).map((d) => <Fila key={d.id} d={d} conEnlaceOT={comercial} fecha={d.revisado_at} />)
        )}
      </section>
    </div>
  );
}
