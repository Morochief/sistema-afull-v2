import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';

const TONOS = { normal: 'text-white', alerta: 'text-amber-400', ok: 'text-emerald-400' } as const;

/** Número grande con su etiqueta; si lleva `a`, toda la tarjeta es un enlace. */
export function Indicador({ titulo, valor, detalle, a, tono = 'normal' }: { titulo: string; valor: ReactNode; detalle?: ReactNode; a?: string; tono?: keyof typeof TONOS }) {
  const cuerpo = (
    <div className="h-full rounded-md border border-[#1f2937] bg-[#111318] p-3 transition-colors hover:border-[#ea580c]/60">
      <div className="text-[11px] uppercase tracking-wide text-neutral-500">{titulo}</div>
      <div className={`mt-1 break-words font-mono text-xl font-semibold sm:text-2xl ${TONOS[tono]}`}>{valor}</div>
      {detalle && <div className="mt-0.5 text-[11px] text-neutral-400">{detalle}</div>}
    </div>
  );
  return a ? <Link to={a} className="block">{cuerpo}</Link> : cuerpo;
}

/** Bloque con título y lista; muestra `vacio` cuando no hay nada. */
export function Bloque({ titulo, children, vacio, hayDatos, accion }: { titulo: string; children: ReactNode; vacio: string; hayDatos: boolean; accion?: ReactNode }) {
  return (
    <section className="rounded-md border border-[#1f2937] bg-[#111318]">
      <header className="flex items-center justify-between border-b border-[#1f2937] px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-300">{titulo}</h2>
        {accion}
      </header>
      <div className="divide-y divide-[#1f2937]">{hayDatos ? children : <p className="px-3 py-4 text-xs text-neutral-500">{vacio}</p>}</div>
    </section>
  );
}
