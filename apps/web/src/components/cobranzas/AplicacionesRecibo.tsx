import type { FacturaFila } from '@afull/shared';
import { formatearFechaDate } from '../../lib/fechas.js';
import { formatearGs } from '../../lib/formato.js';

export type Marcas = Record<string, string>; // facturaId → monto escrito (vacío = no se cobra)

/** Facturas con saldo del cliente: tildar las que paga este recibo y cuánto de cada una (por defecto, todo el saldo). */
export function AplicacionesRecibo({ facturas, marcas, onCambio, error }: {
  facturas: FacturaFila[]; marcas: Marcas; onCambio: (m: Marcas) => void; error?: string;
}) {
  if (facturas.length === 0) return <p className="rounded border border-[#1f2937] p-3 text-xs text-neutral-400">Este cliente no tiene facturas con saldo. Cargá primero la factura.</p>;
  return (
    <div>
      <div className="max-h-56 overflow-y-auto rounded border border-[#1f2937]">
        <table className="w-full text-xs">
          <thead className="bg-[#111318] text-left text-neutral-400">
            <tr><th className="w-8 p-2" /><th className="p-2">Factura</th><th className="p-2 text-right">Saldo</th><th className="w-36 p-2 text-right">Cobra</th></tr>
          </thead>
          <tbody>
            {facturas.map((f) => {
              const on = f.id in marcas;
              return (
                <tr key={f.id} className="border-t border-[#1f2937]">
                  <td className="p-2">
                    <input type="checkbox" aria-label={`Cobrar ${f.numero}`} checked={on} onChange={() => {
                      const n = { ...marcas };
                      if (on) delete n[f.id]; else n[f.id] = f.saldo_gs.toLocaleString('es-PY');
                      onCambio(n);
                    }} />
                  </td>
                  <td className="p-2"><span className="font-mono text-neutral-100">{f.numero}</span> <span className="text-neutral-500">{formatearFechaDate(f.fecha)}</span></td>
                  <td className="p-2 text-right font-mono text-neutral-300">{formatearGs(f.saldo_gs)}</td>
                  <td className="p-2">
                    <input aria-label={`Monto ${f.numero}`} disabled={!on} inputMode="numeric" value={marcas[f.id] ?? ''}
                      onChange={(e) => onCambio({ ...marcas, [f.id]: e.target.value })}
                      className="w-full rounded border border-[#1f2937] bg-[#090a0f] px-2 py-1 text-right font-mono text-neutral-100 disabled:opacity-40" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
