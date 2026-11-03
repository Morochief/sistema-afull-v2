import { useEffect } from 'react';
import { useParams } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import type { PresupuestoItemFila } from '@afull/shared';
import { obtenerPresupuesto } from '../../lib/api-presupuestos.js';
import { mensajeDeError, type ErrorApi } from '../../lib/api.js';
import { formatearDia } from '../../lib/fechas.js';
import { formatearGs } from '../../lib/formato.js';
import { CONCEPTO, ivaIncluido } from '../../components/presupuestos/etiquetas.js';

/**
 * Hoja limpia para imprimir o "Guardar como PDF" desde el navegador (sin librerías ni costo).
 * Va fuera del AppLayout para que no salga el menú; si no hay sesión, la API responde 401 y se avisa.
 */
export function PresupuestoImprimirPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const { data: p, error, isLoading } = useQuery({ queryKey: ['presupuesto', id], queryFn: () => obtenerPresupuesto(id) });

  useEffect(() => {
    document.title = p ? `${p.numero} v${p.version} — ${p.titulo}` : 'Presupuesto';
  }, [p]);

  if (isLoading) return <p className="p-8 text-sm">Cargando…</p>;
  if (error || !p) return <p className="p-8 text-sm">{mensajeDeError(error as ErrorApi, 'No se pudo cargar el presupuesto. Iniciá sesión e intentá de nuevo.')}</p>;

  const activos = p.items.filter((i) => i.activo);
  const grupos = new Map<string, PresupuestoItemFila[]>();
  for (const i of activos) {
    const k = i.sucursal_nombre ?? '';
    grupos.set(k, [...(grupos.get(k) ?? []), i]);
  }
  const factor = 1 + p.margen_pct / 100;
  const total = p.total_gs;
  const vence = p.enviado_at ? new Date(new Date(p.enviado_at).getTime() + p.validez_dias * 86_400_000) : null;

  return (
    <div className="min-h-screen bg-white text-[13px] text-neutral-900">
      <div className="mx-auto max-w-3xl p-8 print:p-0">
        <div className="mb-4 flex justify-end gap-2 print:hidden">
          <button type="button" onClick={() => window.print()} className="rounded bg-[#ea580c] px-4 py-2 text-xs font-semibold text-white">Imprimir / Guardar PDF</button>
        </div>
        <header className="mb-6 flex items-start justify-between border-b-2 border-[#ea580c] pb-4">
          <div>
            <div className="text-2xl font-black tracking-tight">aFull</div>
            <div className="text-xs text-neutral-500">Cartelería y rotulación</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold">PRESUPUESTO</div>
            <div className="font-mono text-xs">{p.numero} · versión {p.version}</div>
            <div className="text-xs text-neutral-500">Fecha: {formatearDia(p.enviado_at ?? p.created_at)}</div>
          </div>
        </header>
        <section className="mb-4">
          <div className="text-xs text-neutral-500">Cliente</div>
          <div className="font-semibold">{p.cliente_nombre}</div>
          <div className="mt-2 text-xs text-neutral-500">Trabajo</div>
          <div className="font-semibold">{p.titulo}</div>
          {p.notas && <p className="mt-2 whitespace-pre-wrap text-xs text-neutral-700">{p.notas}</p>}
        </section>
        {[...grupos.entries()].map(([suc, items]) => (
          <table key={suc} className="mb-4 w-full border-collapse">
            {suc && <caption className="mb-1 text-left text-xs font-semibold uppercase text-neutral-600">Local: {suc}</caption>}
            <thead>
              <tr className="border-b border-neutral-300 text-left text-[11px] uppercase text-neutral-500">
                <th className="py-1">Descripción</th>
                <th className="py-1 text-right">Cant.</th>
                <th className="py-1 text-right">Precio unit.</th>
                <th className="py-1 text-right">Importe</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-b border-neutral-100">
                  <td className="py-1">{i.descripcion} <span className="text-[11px] text-neutral-400">({CONCEPTO[i.concepto]})</span></td>
                  <td className="py-1 text-right font-mono">{i.cantidad.toLocaleString('es-PY', { maximumFractionDigits: 4 })} {i.unidad.toLowerCase()}</td>
                  <td className="py-1 text-right font-mono">{formatearGs(Math.round(i.precio_unitario_gs * factor))}</td>
                  <td className="py-1 text-right font-mono">{formatearGs(Math.round((i.subtotal_gs ?? 0) * factor))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
        <div className="ml-auto mt-4 w-64 space-y-1">
          <div className="flex justify-between border-t-2 border-neutral-900 pt-1 text-base font-bold">
            <span>TOTAL</span>
            <span className="font-mono">{total === null ? 'Borrador' : formatearGs(total)}</span>
          </div>
          {total !== null && (
            <div className="flex justify-between text-xs text-neutral-500"><span>IVA 10 % incluido</span><span className="font-mono">{formatearGs(ivaIncluido(total))}</span></div>
          )}
        </div>
        <footer className="mt-10 border-t border-neutral-200 pt-3 text-[11px] text-neutral-500">
          Validez de la oferta: {p.validez_dias} días{vence && ` (hasta el ${formatearDia(vence.toISOString())})`}. Precios en guaraníes.
          {total !== null && ' Los importes por línea están redondeados; el total es el que rige.'}
        </footer>
      </div>
    </div>
  );
}
