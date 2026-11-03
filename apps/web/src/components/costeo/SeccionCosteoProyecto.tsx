import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { costeoDeProyecto } from '../../lib/api-costeo.js';
import { claseMargen, textoMargen } from '../../lib/margen.js';
import { formatearGs } from '../../lib/formato.js';

/** Consolidado del proyecto: venta, costo real y margen por OT y total (OTs cerradas congeladas, abiertas a la fecha). */
export function SeccionCosteoProyecto({ proyectoId }: { proyectoId: string }) {
  const { data: p } = useQuery({ queryKey: ['costeo', 'proyecto', proyectoId], queryFn: () => costeoDeProyecto(proyectoId) });
  if (!p) return null;
  return (
    <section className="space-y-3 rounded-md border border-[#1f2937] bg-[#111318] p-4" data-testid="costeo-proyecto">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Costo real vs. presupuestado</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-neutral-500">
            <tr><th className="py-1">OT</th><th className="text-right">Venta</th><th className="text-right">Mano de obra</th><th className="text-right">Material</th><th className="text-right">Vehículo</th><th className="text-right">Costo</th><th className="text-right">Margen</th></tr>
          </thead>
          <tbody>
            {p.ots.map((o) => (
              <tr key={o.id} className="border-t border-[#1f2937] text-neutral-200">
                <td className="py-1.5">
                  <Link to="/ots/$id" params={{ id: o.id }} className="font-mono text-[#ea580c] hover:underline">{o.codigo_ot}</Link>
                  <span className="ml-1 text-[10px] text-neutral-500">{o.congelado ? 'cerrada' : 'a la fecha'}</span>
                </td>
                <td className="text-right font-mono">{formatearGs(o.monto_presupuestado_gs)}</td>
                <td className="text-right font-mono">{formatearGs(o.mano_obra_gs)}</td>
                <td className="text-right font-mono">{formatearGs(o.material_gs)}</td>
                <td className="text-right font-mono">{formatearGs(o.km_gs)}</td>
                <td className="text-right font-mono text-white">{formatearGs(o.total_gs)}</td>
                <td className={`text-right font-mono ${claseMargen(o.margen_pct)}`}>{textoMargen(o.margen_pct)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-[#1f2937] font-semibold text-white">
              <td className="py-1.5">Total</td>
              <td className="text-right font-mono">{formatearGs(p.monto_presupuestado_gs)}</td>
              <td className="text-right font-mono">{formatearGs(p.mano_obra_gs)}</td>
              <td className="text-right font-mono">{formatearGs(p.material_gs)}</td>
              <td className="text-right font-mono">{formatearGs(p.km_gs)}</td>
              <td className="text-right font-mono" data-testid="costo-proyecto">{formatearGs(p.total_gs)}</td>
              <td className={`text-right font-mono ${claseMargen(p.margen_pct)}`} data-testid="margen-proyecto">{textoMargen(p.margen_pct)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
