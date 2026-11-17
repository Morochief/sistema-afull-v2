import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { mesActual, obtenerPreFactura, query, type FiltroPreFactura } from '../../lib/api-reportes.js';
import { mensajeDeError, type ErrorApi } from '../../lib/api.js';
import { Input } from '../ui/input.js';
import { Label } from '../ui/label.js';
import { SelectorBuscar, type Opcion } from './SelectorBuscar.js';
import { buscarClientes, buscarProyectos } from './buscadores.js';
import { ResumenPreFactura } from './ResumenPreFactura.js';

/** Loop 20: pre-factura por proyecto o por cliente + período, con margen, precio sugerido e impresión A4. */
export function TabPreFactura() {
  const [modo, setModo] = useState<'proyecto' | 'cliente'>('proyecto');
  const [proyecto, setProyecto] = useState<Opcion | null>(null);
  const [cliente, setCliente] = useState<Opcion | null>(null);
  const [rango, setRango] = useState(mesActual);
  const [margen, setMargen] = useState('30');
  const [solicitante, setSolicitante] = useState('');
  const filtro: FiltroPreFactura | null = modo === 'proyecto' ? (proyecto ? { proyectoId: proyecto.id } : null) : cliente ? { clienteId: cliente.id, ...rango } : null;
  const { data, error, isLoading } = useQuery({ queryKey: ['reportes', 'prefactura', filtro], queryFn: () => obtenerPreFactura(filtro!), enabled: !!filtro });
  const m = Number(margen.replace(',', '.')) || 0;
  const imprimir = () => window.open(`/reportes/prefactura/imprimir?${query({ ...filtro, margen: m, solicitante: solicitante.trim() })}`, '_blank');

  return (
    <div className="space-y-3 text-xs">
      <div className="flex gap-3">
        <label className="flex items-center gap-1.5"><input type="radio" checked={modo === 'proyecto'} onChange={() => setModo('proyecto')} /> Por proyecto</label>
        <label className="flex items-center gap-1.5"><input type="radio" checked={modo === 'cliente'} onChange={() => setModo('cliente')} /> Por cliente y período</label>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        {modo === 'proyecto' ? (
          <SelectorBuscar etiqueta="Proyecto" valor={proyecto} onCambio={setProyecto} buscar={buscarProyectos} />
        ) : (
          <>
            <SelectorBuscar etiqueta="Cliente" valor={cliente} onCambio={setCliente} buscar={buscarClientes} />
            <div><Label htmlFor="pfDesde">Desde</Label><Input id="pfDesde" type="date" value={rango.desde} onChange={(e) => setRango({ ...rango, desde: e.target.value })} /></div>
            <div><Label htmlFor="pfHasta">Hasta</Label><Input id="pfHasta" type="date" value={rango.hasta} onChange={(e) => setRango({ ...rango, hasta: e.target.value })} /></div>
          </>
        )}
        <div className="w-28"><Label htmlFor="pfMargen">Margen sobre venta %</Label><Input id="pfMargen" inputMode="decimal" value={margen} onChange={(e) => setMargen(e.target.value)} /></div>
        <div className="min-w-[160px]"><Label htmlFor="pfSolicitante">Solicitante (opcional)</Label><Input id="pfSolicitante" value={solicitante} onChange={(e) => setSolicitante(e.target.value)} /></div>
        <button type="button" disabled={!data} onClick={imprimir}
          className="ml-auto inline-flex h-9 items-center gap-1.5 rounded bg-[#ea580c] px-3 font-semibold text-white disabled:opacity-40">
          <Printer className="h-3.5 w-3.5" /> Imprimir / Guardar PDF
        </button>
      </div>
      {!filtro && <p className="text-neutral-500">Elegí un proyecto, o un cliente con el período.</p>}
      {isLoading && <p className="text-neutral-500">Cargando…</p>}
      {error && <p className="text-red-400">{mensajeDeError(error as ErrorApi, 'No se pudo armar la pre-factura')}</p>}
      {data && <ResumenPreFactura p={data} margen={m} />}
    </div>
  );
}
