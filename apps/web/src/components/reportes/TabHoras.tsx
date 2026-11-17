import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { hhmm, mesActual, obtenerHoras, urlExcelHoras } from '../../lib/api-reportes.js';
import { formatearGs } from '../../lib/formato.js';
import { Input } from '../ui/input.js';
import { Label } from '../ui/label.js';

/**
 * Loop 20: planilla de horas para pagar. Tiempo real del reloj de cada persona (con las correcciones del Loop 13)
 * × su tarifa vigente. Un reloj abierto no suma hasta cerrarlo en Personas → Horas.
 */
export function TabHoras() {
  const [rango, setRango] = useState(mesActual);
  const { data, isLoading } = useQuery({ queryKey: ['reportes', 'horas', rango], queryFn: () => obtenerHoras(rango.desde, rango.hasta) });
  const total = data?.items.reduce((a, x) => a + x.total_gs, 0) ?? 0;
  return (
    <div className="space-y-3 text-xs">
      <div className="flex flex-wrap items-end gap-2">
        <div><Label htmlFor="horasRepDesde">Desde</Label><Input id="horasRepDesde" type="date" value={rango.desde} onChange={(e) => setRango({ ...rango, desde: e.target.value })} /></div>
        <div><Label htmlFor="horasRepHasta">Hasta</Label><Input id="horasRepHasta" type="date" value={rango.hasta} onChange={(e) => setRango({ ...rango, hasta: e.target.value })} /></div>
        <a href={urlExcelHoras(rango.desde, rango.hasta)} download className="ml-auto inline-flex h-9 items-center gap-1.5 rounded bg-emerald-600 px-3 font-semibold text-white hover:bg-emerald-500">
          <Download className="h-3.5 w-3.5" /> Descargar Excel
        </a>
      </div>
      <div className="overflow-x-auto rounded border border-[#1f2937]">
        <table className="w-full min-w-[560px] text-left">
          <thead className="bg-[#111318] text-neutral-400">
            <tr><th className="p-2">Persona</th><th className="p-2 text-right">Horas</th><th className="p-2 text-right">Tramos</th><th className="p-2 text-right">A pagar</th><th className="p-2">Avisos</th></tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="p-4 text-center text-neutral-500">Cargando…</td></tr>}
            {data?.items.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-neutral-500">Nadie trabajó horas en esas fechas.</td></tr>}
            {data?.items.map((x) => (
              <tr key={x.persona_id} className="border-t border-[#1f2937]">
                <td className="p-2 text-neutral-200">{x.persona}</td>
                <td className="p-2 text-right font-mono">{hhmm(x.segundos / 60)}</td>
                <td className="p-2 text-right font-mono">{x.tramos}</td>
                <td className="p-2 text-right font-mono">{formatearGs(x.total_gs)}</td>
                <td className="p-2 text-amber-300">
                  {[x.sin_tarifa && 'Horas sin tarifa (cuentan 0): cargala en Personas', x.reloj_abierto && 'Tiene un reloj abierto: cerralo en Personas → Horas'].filter(Boolean).join(' · ')}
                </td>
              </tr>
            ))}
          </tbody>
          {data && data.items.length > 0 && (
            <tfoot><tr className="border-t border-[#1f2937] font-bold"><td className="p-2" colSpan={3}>Total</td><td className="p-2 text-right font-mono text-[#ea580c]">{formatearGs(total)}</td><td /></tr></tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
