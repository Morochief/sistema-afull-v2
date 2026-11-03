import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Lock } from 'lucide-react';
import { costeoDeOT } from '../../lib/api-costeo.js';
import { claseMargen, textoMargen } from '../../lib/margen.js';
import { formatearFechaHora } from '../../lib/fechas.js';
import { formatearGs } from '../../lib/formato.js';

const horas = (h: number) => `${h.toLocaleString('es-PY', { maximumFractionDigits: 2 })} h`;

function Cifra({ titulo, valor, sub, testid }: { titulo: string; valor: string; sub?: string; testid?: string }) {
  return (
    <div className="rounded border border-[#1f2937] bg-[#090a0f] p-3">
      <div className="text-[11px] uppercase tracking-wider text-neutral-500">{titulo}</div>
      <div className="font-mono text-sm text-white" data-testid={testid}>{valor}</div>
      {sub && <div className="text-[11px] text-neutral-500">{sub}</div>}
    </div>
  );
}

/** Costo real de la OT (solo admin y comercial: esta pantalla ya es de Comercial). Congelado al cerrar; antes, a la fecha. */
export function SeccionCosteoOT({ otId, estado }: { otId: string; estado: string }) {
  // El estado en la clave: al terminar o cancelar se vuelve a pedir y aparece congelado.
  const { data: c } = useQuery({ queryKey: ['costeo', 'ot', otId, estado], queryFn: () => costeoDeOT(otId) });
  if (!c) return null;
  const resultado = c.monto_presupuestado_gs === null ? null : c.monto_presupuestado_gs - c.total_gs;

  return (
    <div className="space-y-3 rounded-md border border-[#1f2937] bg-[#111318] p-4" data-testid="seccion-costeo">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Costo real</h2>
        <span className="flex items-center gap-1 text-[11px] text-neutral-500">
          {c.congelado ? <><Lock className="h-3 w-3" /> Congelado al cerrar · {formatearFechaHora(c.congelado_at)}</> : 'A la fecha · se congela al terminar o cancelar la OT'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Cifra titulo="Mano de obra" valor={formatearGs(c.mano_obra_gs)} sub={horas(c.horas)} />
        <Cifra titulo="Material" valor={formatearGs(c.material_gs)} sub={c.desperdicio_gs ? `desperdicio ${formatearGs(c.desperdicio_gs)}` : undefined} />
        <Cifra titulo="Vehículo" valor={formatearGs(c.km_gs)} sub={`${c.km.toLocaleString('es-PY')} km`} />
        <Cifra titulo="Costo total" valor={formatearGs(c.total_gs)} testid="costo-total" />
      </div>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-t border-[#1f2937] pt-2 text-xs">
        <span className="text-neutral-400">Venta (sin IVA): <span className="font-mono text-white">{formatearGs(c.monto_presupuestado_gs)}</span></span>
        <span className="text-neutral-400">Resultado: <span className={`font-mono ${resultado !== null && resultado < 0 ? 'text-red-400' : 'text-white'}`}>{resultado === null ? '—' : formatearGs(resultado)}</span></span>
        <span className="text-neutral-400">Margen real: <span className={`font-mono font-semibold ${claseMargen(c.margen_pct)}`} data-testid="margen-real">{textoMargen(c.margen_pct)}</span></span>
      </div>
      {c.alertas.length > 0 && (
        <ul className="space-y-1 rounded border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] text-amber-300">
          {c.alertas.map((a) => <li key={a} className="flex gap-1"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {a}</li>)}
        </ul>
      )}
      {c.mano_obra.length > 0 && (
        <table className="w-full text-xs">
          <thead className="text-left text-neutral-500"><tr><th className="py-1">Persona</th><th>Proceso</th><th className="text-right">Horas</th><th className="text-right">Tarifa</th><th className="text-right">Costo</th></tr></thead>
          <tbody>
            {c.mano_obra.map((m) => (
              <tr key={`${m.persona}-${m.proceso}`} className="border-t border-[#1f2937] text-neutral-200">
                <td className="py-1">{m.persona}</td><td className="text-neutral-400">{m.proceso}</td>
                <td className="text-right font-mono">{horas(m.horas)}</td>
                <td className="text-right font-mono text-neutral-400">{m.sin_tarifa ? <span className="text-amber-400">sin tarifa</span> : m.tarifa_hora_gs === null ? 'varias' : formatearGs(m.tarifa_hora_gs)}</td>
                <td className="text-right font-mono">{formatearGs(m.costo_gs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {c.viajes.length > 0 && (
        <div className="space-y-1 text-[11px] text-neutral-400">
          {c.viajes.map((v) => (
            <div key={v.viaje_id}>
              {v.fecha} · {v.chapa}: {v.km_viaje} km{v.ots_en_hoja > 1 ? ` ÷ ${v.ots_en_hoja} OTs = ${v.km_ot} km` : ''} × {formatearGs(v.costo_km_gs)} = <span className="font-mono text-neutral-200">{formatearGs(v.costo_gs)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
