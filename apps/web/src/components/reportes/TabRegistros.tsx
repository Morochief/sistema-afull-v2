import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { mesActual, obtenerRegistros, urlExcelRegistros, type FiltroRegistros } from '../../lib/api-reportes.js';
import { duracion } from '../../lib/api-horas.js';
import { formatearGs } from '../../lib/formato.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';
import { Label } from '../ui/label.js';
import { SelectorBuscar, type Opcion } from './SelectorBuscar.js';
import { buscarClientes, buscarPersonas, buscarProyectos } from './buscadores.js';

const num = (n: number) => n.toLocaleString('es-PY', { maximumFractionDigits: 4 });
const dia = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;

/** Loop 20: los registros del Excel de Juan (mano de obra, insumos y vehículos), filtrables y descargables. */
export function TabRegistros() {
  const [rango, setRango] = useState(mesActual);
  const [cliente, setCliente] = useState<Opcion | null>(null);
  const [proyecto, setProyecto] = useState<Opcion | null>(null);
  const [persona, setPersona] = useState<Opcion | null>(null);
  const [concepto, setConcepto] = useState<FiltroRegistros['concepto']>('');
  const [pagina, setPagina] = useState(1);
  const f = { ...rango, clienteId: cliente?.id, proyectoId: proyecto?.id, personaId: persona?.id, concepto };
  const { data, isLoading } = useQuery({ queryKey: ['reportes', 'registros', f, pagina], queryFn: () => obtenerRegistros({ ...f, pagina }) });
  const cambiar = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPagina(1); };
  const paginas = Math.max(1, Math.ceil((data?.total ?? 0) / 25));
  const t = data?.totales;

  return (
    <div className="space-y-3 text-xs">
      <div className="flex flex-wrap items-end gap-2">
        <div><Label htmlFor="regDesde">Desde</Label><Input id="regDesde" type="date" value={rango.desde} onChange={(e) => cambiar(setRango)({ ...rango, desde: e.target.value })} /></div>
        <div><Label htmlFor="regHasta">Hasta</Label><Input id="regHasta" type="date" value={rango.hasta} onChange={(e) => cambiar(setRango)({ ...rango, hasta: e.target.value })} /></div>
        <SelectorBuscar etiqueta="Cliente" valor={cliente} onCambio={cambiar(setCliente)} buscar={buscarClientes} />
        <SelectorBuscar etiqueta="Proyecto" valor={proyecto} onCambio={cambiar(setProyecto)} buscar={buscarProyectos} />
        <SelectorBuscar etiqueta="Persona" valor={persona} onCambio={cambiar(setPersona)} buscar={buscarPersonas} />
        <div>
          <Label htmlFor="regConcepto">Concepto</Label>
          <select id="regConcepto" value={concepto} onChange={(e) => cambiar(setConcepto)(e.target.value as FiltroRegistros['concepto'])}
            className="h-9 rounded border border-[#1f2937] bg-[#111318] px-2 text-xs text-neutral-200">
            <option value="">Todos</option><option value="MO">Mano de obra</option><option value="INSUMO">Insumos</option><option value="VEHICULO">Vehículos</option>
          </select>
        </div>
        <a href={urlExcelRegistros(f)} download className="ml-auto inline-flex h-9 items-center gap-1.5 rounded bg-emerald-600 px-3 font-semibold text-white hover:bg-emerald-500">
          <Download className="h-3.5 w-3.5" /> Descargar Excel
        </a>
      </div>
      {t && (
        <div data-testid="totales-registros" className="grid grid-cols-2 gap-2 rounded border border-[#1f2937] bg-[#090a0f] p-2 sm:grid-cols-4">
          <div><div className="text-neutral-500">Mano de obra ({duracion(t.minutos * 60)})</div><div className="font-mono text-white">{formatearGs(t.mano_obra_gs)}</div></div>
          <div><div className="text-neutral-500">Insumos</div><div className="font-mono text-white">{formatearGs(t.insumos_gs)}</div></div>
          <div><div className="text-neutral-500">Vehículos</div><div className="font-mono text-white">{formatearGs(t.vehiculos_gs)}</div></div>
          <div><div className="text-neutral-500">Total</div><div className="font-mono font-bold text-[#ea580c]">{formatearGs(t.total_gs)}</div></div>
        </div>
      )}
      <div className="overflow-x-auto rounded border border-[#1f2937]">
        <table className="w-full min-w-[820px] text-left">
          <thead className="bg-[#111318] text-neutral-400">
            <tr><th className="p-2">Fecha</th><th className="p-2">OT · Cliente</th><th className="p-2">Concepto</th><th className="p-2">Descripción</th>
              <th className="p-2">Inicio</th><th className="p-2">Fin</th><th className="p-2 text-right">Cantidad</th><th className="p-2 text-right">Precio unit.</th><th className="p-2 text-right">Total</th></tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={9} className="p-4 text-center text-neutral-500">Cargando…</td></tr>}
            {data?.items.length === 0 && <tr><td colSpan={9} className="p-4 text-center text-neutral-500">No hay registros con esos filtros.</td></tr>}
            {data?.items.map((r, i) => (
              <tr key={`${r.ot_id}-${r.fecha}-${i}`} className="border-t border-[#1f2937]">
                <td className="p-2 font-mono">{dia(r.fecha)}</td>
                <td className="p-2">{r.ot_codigo}<div className="text-[10px] text-neutral-500">{r.cliente}</div></td>
                <td className="p-2">{r.concepto}</td>
                <td className="p-2">{r.descripcion}</td>
                <td className="p-2 font-mono">{r.hs_inicio ?? ''}</td><td className="p-2 font-mono">{r.hs_fin ?? ''}</td>
                <td className="p-2 text-right font-mono">{num(r.cantidad)} {r.unidad}</td>
                <td className="p-2 text-right font-mono">{num(r.precio_unitario)}</td>
                <td className="p-2 text-right font-mono">{formatearGs(r.total_gs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {paginas > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button size="sm" variant="outline" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>Anterior</Button>
          <span>{pagina} / {paginas} · {data?.total} registros</span>
          <Button size="sm" variant="outline" disabled={pagina >= paginas} onClick={() => setPagina(pagina + 1)}>Siguiente</Button>
        </div>
      )}
    </div>
  );
}
