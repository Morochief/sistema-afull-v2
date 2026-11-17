import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { obtenerPreFactura } from '../../lib/api-reportes.js';
import { mensajeDeError, type ErrorApi } from '../../lib/api.js';
import { formatearGs } from '../../lib/formato.js';
import { ResumenPreFactura } from '../../components/reportes/ResumenPreFactura.js';

/** Loop 20: hoja A4 limpia de la pre-factura para imprimir o "Guardar como PDF" (fuera del menú, como el presupuesto). */
export function PreFacturaImprimirPage() {
  const s = new URLSearchParams(window.location.search);
  const filtro = { proyectoId: s.get('proyectoId') ?? undefined, clienteId: s.get('clienteId') ?? undefined, desde: s.get('desde') ?? undefined, hasta: s.get('hasta') ?? undefined };
  const margen = Number(s.get('margen') ?? 30);
  const solicitante = s.get('solicitante');
  const { data: p, error, isLoading } = useQuery({ queryKey: ['reportes', 'prefactura', filtro], queryFn: () => obtenerPreFactura(filtro) });
  useEffect(() => { document.title = p ? `Pre-factura — ${p.cliente.nombre}` : 'Pre-factura'; }, [p]);
  if (isLoading) return <p className="p-8 text-sm">Cargando…</p>;
  if (error || !p) return <p className="p-8 text-sm">{mensajeDeError(error as ErrorApi, 'No se pudo cargar la pre-factura. Iniciá sesión e intentá de nuevo.')}</p>;
  const hoy = new Intl.DateTimeFormat('es-PY', { timeZone: 'America/Asuncion', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());
  return (
    <div className="min-h-screen bg-white text-[12px] text-neutral-900">
      <div className="mx-auto max-w-3xl space-y-4 p-8 print:p-0">
        <div className="flex justify-end print:hidden">
          <button type="button" onClick={() => window.print()} className="rounded bg-[#ea580c] px-4 py-2 text-xs font-semibold text-white">Imprimir / Guardar PDF</button>
        </div>
        <div className="flex items-start justify-between border-b-2 border-[#ea580c] pb-3">
          <div><p className="text-xl font-extrabold">aFull</p><p className="text-neutral-500">Pre-factura (documento interno, no válido como factura)</p></div>
          <div className="text-right"><p>Fecha: {hoy}</p>{solicitante && <p>Solicitante: {solicitante}</p>}</div>
        </div>
        <ResumenPreFactura p={p} margen={margen} claro />
        <div>
          <p className="mb-1 font-semibold uppercase text-neutral-600">Detalle ({p.registros.length} registros)</p>
          <table className="w-full text-left text-[10px]">
            <thead><tr className="border-b border-neutral-300"><th className="py-1">Fecha</th><th>OT</th><th>Concepto</th><th>Descripción</th><th className="text-right">Cantidad</th><th className="text-right">Precio</th><th className="text-right">Total</th></tr></thead>
            <tbody>
              {p.registros.map((r, i) => (
                <tr key={i} className="border-b border-neutral-200">
                  <td className="py-0.5 font-mono">{r.fecha}</td><td>{r.ot_codigo}</td><td>{r.concepto}</td><td>{r.descripcion}{r.hs_inicio ? ` (${r.hs_inicio}–${r.hs_fin})` : ''}</td>
                  <td className="text-right font-mono">{r.cantidad.toLocaleString('es-PY', { maximumFractionDigits: 4 })} {r.unidad}</td>
                  <td className="text-right font-mono">{r.precio_unitario.toLocaleString('es-PY', { maximumFractionDigits: 4 })}</td>
                  <td className="text-right font-mono">{formatearGs(r.total_gs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
