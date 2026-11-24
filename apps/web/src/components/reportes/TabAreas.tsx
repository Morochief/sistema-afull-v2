import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Download } from 'lucide-react';
import { hhmm, mesActual, obtenerAreas, urlExcelAreas } from '../../lib/api-reportes.js';
import { Input } from '../ui/input.js';
import { Label } from '../ui/label.js';
import { SelectorBuscar, type Opcion } from './SelectorBuscar.js';
import { buscarClientes, buscarProyectos } from './buscadores.js';

const hs = (s: number | undefined) => (s ? hhmm(s / 60) : '');

/**
 * Loop 22: cuánto llevó cada trabajo en cada área (Terminaciones, Carpintería, Pintura…) y qué área se llevó más
 * horas en el período. Con tanda, el tiempo va repartido por m² como en el costo.
 */
export function TabAreas() {
  const [rango, setRango] = useState(mesActual);
  const [cliente, setCliente] = useState<Opcion | null>(null);
  const [proyecto, setProyecto] = useState<Opcion | null>(null);
  const f = { ...rango, clienteId: cliente?.id, proyectoId: proyecto?.id };
  const { data, isLoading } = useQuery({ queryKey: ['reportes', 'areas', f], queryFn: () => obtenerAreas(f) });
  const areas = data?.areas ?? [];
  const mayor = areas.reduce((m, a) => (a.segundos > (m?.segundos ?? 0) ? a : m), null as (typeof areas)[number] | null);
  const total = areas.reduce((a, x) => a + x.segundos, 0);

  return (
    <div className="space-y-3 text-xs">
      <div className="flex flex-wrap items-end gap-2">
        <div><Label htmlFor="areaDesde">Desde</Label><Input id="areaDesde" type="date" value={rango.desde} onChange={(e) => setRango({ ...rango, desde: e.target.value })} /></div>
        <div><Label htmlFor="areaHasta">Hasta</Label><Input id="areaHasta" type="date" value={rango.hasta} onChange={(e) => setRango({ ...rango, hasta: e.target.value })} /></div>
        <SelectorBuscar etiqueta="Cliente" valor={cliente} onCambio={setCliente} buscar={buscarClientes} />
        <SelectorBuscar etiqueta="Proyecto" valor={proyecto} onCambio={setProyecto} buscar={buscarProyectos} />
        <a href={urlExcelAreas(f)} download className="ml-auto inline-flex h-9 items-center gap-1.5 rounded bg-emerald-600 px-3 font-semibold text-white hover:bg-emerald-500">
          <Download className="h-3.5 w-3.5" /> Descargar Excel
        </a>
      </div>
      {areas.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Total por área">
          {areas.map((a) => (
            <div key={a.codigo} className={`rounded border px-3 py-1.5 ${a === mayor ? 'border-[#ea580c] bg-[#ea580c]/10' : 'border-[#1f2937] bg-[#111318]'}`}>
              <span className="text-neutral-400">{a.nombre}</span> <span className="font-mono font-semibold text-white">{hs(a.segundos)}</span>
              <span className="ml-1 text-neutral-500">{Math.round((a.segundos / total) * 100)} %</span>
            </div>
          ))}
        </div>
      )}
      <div className="overflow-x-auto rounded border border-[#1f2937]">
        <table className="w-full min-w-[640px] text-left">
          <thead className="bg-[#111318] text-neutral-400">
            <tr>
              <th className="p-2">OT</th><th className="p-2">Cliente · trabajo</th>
              {areas.map((a) => <th key={a.codigo} className="p-2 text-right">{a.nombre}</th>)}
              <th className="p-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={areas.length + 3} className="p-4 text-center text-neutral-500">Cargando…</td></tr>}
            {data?.filas.length === 0 && <tr><td colSpan={3} className="p-4 text-center text-neutral-500">No hay horas cargadas en esas fechas.</td></tr>}
            {data?.filas.map((r) => (
              <tr key={r.ot_id} className="border-t border-[#1f2937]">
                <td className="p-2"><Link to="/ots/$id" params={{ id: r.ot_id }} className="font-mono text-[#ea580c] hover:underline">{r.ot_codigo}</Link></td>
                <td className="p-2 text-neutral-200">{r.cliente} <span className="text-neutral-500">· {r.titulo}</span></td>
                {areas.map((a) => <td key={a.codigo} className="p-2 text-right font-mono">{hs(r.por_area[a.codigo])}</td>)}
                <td className="p-2 text-right font-mono font-semibold text-white">{hs(r.segundos)}</td>
              </tr>
            ))}
          </tbody>
          {data && data.filas.length > 0 && (
            <tfoot>
              <tr className="border-t border-[#1f2937] font-bold">
                <td className="p-2" colSpan={2}>Total</td>
                {areas.map((a) => <td key={a.codigo} className="p-2 text-right font-mono">{hs(a.segundos)}</td>)}
                <td className="p-2 text-right font-mono text-[#ea580c]">{hs(total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
