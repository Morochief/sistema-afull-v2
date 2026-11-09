import { Link } from '@tanstack/react-router';
import { X } from 'lucide-react';
import type { ItemMenu } from './menu.js';

type Props = { items: ItemMenu[]; ruta: string; abierto: boolean; onCerrar: () => void };

/**
 * Menú lateral. En la compu (≥ 768 px) queda fijo a la izquierda; en el celular se esconde
 * y se abre como panel desde el botón ☰ del encabezado (se cierra al elegir una sección o tocar afuera).
 */
export function MenuLateral({ items, ruta, abierto, onCerrar }: Props) {
  return (
    <>
      {abierto && <div className="fixed inset-0 z-30 bg-black/60 md:hidden" onClick={onCerrar} aria-hidden="true" />}
      <aside
        id="menu-lateral"
        aria-label="Menú principal"
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-[#1f2937] bg-[#111318] transition-transform duration-200 md:static md:w-60 md:translate-x-0 ${
          abierto ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-14 items-center gap-2.5 border-b border-[#1f2937] px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-[#ea580c] text-sm font-bold text-white">aF</div>
          <span className="flex-1 text-sm font-semibold tracking-tight text-white">Sistema aFull</span>
          <button type="button" onClick={onCerrar} aria-label="Cerrar menú" className="rounded p-1.5 text-neutral-400 hover:bg-[#1f2937] hover:text-white md:hidden">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {items.map((item) => {
            const Icono = item.icono;
            const activo = ruta.startsWith(item.ruta);
            return (
              <Link
                key={item.ruta}
                to={item.ruta}
                onClick={onCerrar}
                className={`flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium transition-colors md:py-2 md:text-xs ${
                  activo ? 'bg-[#ea580c]/15 text-[#ea580c]' : 'text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200'
                }`}
              >
                <Icono className="h-4 w-4" />
                <span>{item.titulo}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-[#1f2937] p-3 text-xs text-neutral-500">v3.0 · aFull Cartelería</div>
      </aside>
    </>
  );
}
