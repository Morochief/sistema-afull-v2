import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { portalRecibo, portalRecibos } from '../../lib/api-cobranzas.js';
import { formatearFechaDate } from '../../lib/fechas.js';
import { formatearGs } from '../../lib/formato.js';
import { HojaRecibo } from '../cobranzas/HojaRecibo.js';

/** Loop 21: el cliente ve e imprime sus recibos de dinero (el mismo formato que le llega de la oficina). */
export function RecibosPortal({ token }: { token: string }) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const lista = useQuery({ queryKey: ['portal', 'recibos'], queryFn: () => portalRecibos(token) });
  const uno = useQuery({ queryKey: ['portal', 'recibo', abierto], queryFn: () => portalRecibo(token, abierto!), enabled: Boolean(abierto) });

  if (abierto) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-white p-4 print:static print:p-0">
        <div className="mx-auto mb-3 flex max-w-[190mm] justify-between print:hidden">
          <button type="button" onClick={() => setAbierto(null)} className="text-xs text-neutral-600 underline">← Volver</button>
          <button type="button" onClick={() => window.print()} className="rounded bg-[#ea580c] px-4 py-2 text-xs font-semibold text-white">Imprimir / Guardar PDF</button>
        </div>
        {uno.data ? <HojaRecibo r={uno.data} /> : <p className="text-sm text-neutral-600">Cargando recibo…</p>}
      </div>
    );
  }
  if (lista.isLoading) return <p className="text-sm text-neutral-500">Cargando tus recibos…</p>;
  const items = lista.data?.items ?? [];
  if (items.length === 0) return <p className="rounded-md border border-[#1f2937] p-4 text-sm text-neutral-400">Todavía no hay recibos de pago.</p>;
  return (
    <ul className="divide-y divide-[#1f2937] rounded-md border border-[#1f2937] bg-[#111318]">
      {items.map((r) => (
        <li key={r.id}>
          <button type="button" onClick={() => setAbierto(r.id)} className="flex w-full items-center justify-between p-3 text-left text-sm hover:bg-[#1f2937]">
            <span>
              <span className="font-mono font-semibold text-[#ea580c]">{r.numero}</span>
              <span className="ml-2 text-xs text-neutral-400">{formatearFechaDate(r.fecha)}</span>
              {r.anulado_at && <span className="ml-2 text-xs text-red-400">Anulado</span>}
            </span>
            <span className="font-mono text-white">{formatearGs(r.importe_gs)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
