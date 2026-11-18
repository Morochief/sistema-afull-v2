import { ETIQUETA_MEDIO, type ReciboDetalle } from '@afull/shared';
import { formatearFechaDate } from '../../lib/fechas.js';

const gs = (n: number) => n.toLocaleString('es-PY', { maximumFractionDigits: 0 });

/**
 * Recibo de dinero en A4, con la misma disposición que el de Prosegur que pasó Juan: encabezado con RUC y número,
 * "Recibimos de", moneda, medio y banco, importe en número y en letras, retenciones, facturas que paga, total,
 * lugar y fecha, y la firma del cobrador. No es un comprobante timbrado: la factura electrónica ya la emite aFull.
 * Se usa en la oficina y en el portal del cliente.
 */
export function HojaRecibo({ r }: { r: ReciboDetalle }) {
  const e = r.empresa;
  const total = r.aplicaciones.reduce((s, a) => s + a.monto_gs, 0);
  const ciudad = e?.ciudad ?? 'Asunción';
  return (
    <article className="relative mx-auto max-w-[190mm] overflow-hidden border border-neutral-400 p-8 text-[13px] text-neutral-900 print:border-0 print:p-0">
      {r.anulado_at && (
        <div aria-label="Recibo anulado" className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="-rotate-[25deg] text-[96px] font-black tracking-widest text-red-600/25">ANULADO</span>
        </div>
      )}
      <header className="mb-6 flex items-start justify-between border-b border-neutral-400 pb-4">
        <div>
          <div className="text-xl font-black tracking-tight">{e?.razon_social ?? 'aFull'}</div>
          {e?.direccion && <div className="text-xs">{e.direccion}{e.ciudad ? ` · ${e.ciudad}` : ''}</div>}
          {(e?.telefono || e?.email) && <div className="text-xs">{[e?.telefono, e?.email].filter(Boolean).join(' · ')}</div>}
        </div>
        <div className="text-right">
          <div className="text-lg font-bold tracking-wide">RECIBO DE DINERO</div>
          {e?.ruc && <div className="text-xs">RUC: {e.ruc}</div>}
          <div className="font-mono text-sm font-semibold">Nº {r.numero}</div>
        </div>
      </header>

      <dl className="grid grid-cols-[9rem_1fr] gap-y-2">
        <dt className="font-semibold">Recibimos de:</dt><dd className="uppercase">{r.cliente.nombre}</dd>
        <dt className="font-semibold">RUC/C.I.:</dt>
        <dd className="flex gap-10"><span>{r.cliente.ruc ?? '—'}</span><span>Guaraníes <b>X</b></span><span className="text-neutral-400">Dólares</span></dd>
        <dt className="font-semibold">en:</dt>
        <dd>{ETIQUETA_MEDIO[r.medio]}{r.banco ? ` · c/Banco ${r.banco}` : ''}{r.referencia ? ` · Ref. ${r.referencia}` : ''}</dd>
        <dt className="font-semibold">El importe de:</dt><dd className="font-mono text-base font-bold">Gs. {gs(r.importe_gs)}</dd>
        <dt className="sr-only">En letras</dt>
        <dd className="col-span-2 border-b border-dotted border-neutral-500 pb-1 italic first-letter:uppercase">{r.monto_letras}</dd>
        <dt className="font-semibold">Importe Retenciones:</dt>
        <dd className="font-mono">{gs(r.retenciones_gs)}{r.retencion_numero ? ` (comprobante ${r.retencion_numero})` : ''}</dd>
      </dl>

      <p className="mt-5 mb-2">en pago de las Facturas/Notas de Débito detalladas a continuación:</p>
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-neutral-500 text-left">
            <th className="py-1">Factura Nº</th><th className="py-1">Fecha</th><th className="py-1 text-right">Importe factura</th><th className="py-1 text-right">Pagado Gs.</th>
          </tr>
        </thead>
        <tbody>
          {r.aplicaciones.map((a) => (
            <tr key={a.factura_id} className="border-b border-neutral-200">
              <td className="py-1 font-mono">{a.numero}</td>
              <td className="py-1">{formatearFechaDate(a.fecha)}</td>
              <td className="py-1 text-right font-mono">{gs(a.monto_factura_gs)}</td>
              <td className="py-1 text-right font-mono">{gs(a.monto_gs)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td className="pt-2 font-bold" colSpan={3}>TOTAL</td><td className="pt-2 text-right font-mono font-bold">{gs(total)}</td></tr>
        </tfoot>
      </table>

      {r.anulado_at && <p className="mt-4 text-xs font-semibold text-red-700">Recibo anulado. Motivo: {r.motivo_anulacion}</p>}

      <footer className="mt-16 grid grid-cols-2 gap-10 text-center text-xs">
        <div><div className="border-t border-neutral-500 pt-1">{ciudad} {formatearFechaDate(r.fecha)}</div><div className="text-neutral-500">Lugar y Fecha</div></div>
        <div><div className="border-t border-neutral-500 pt-1">{r.cobrador_nombre}</div><div className="text-neutral-500">Cobrador Autorizado</div></div>
      </footer>
    </article>
  );
}
