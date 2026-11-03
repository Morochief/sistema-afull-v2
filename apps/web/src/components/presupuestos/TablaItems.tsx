import { Edit2, EyeOff, Eye } from 'lucide-react';
import { calcularIvaGs, calcularTotalPresupuesto, type PresupuestoItemFila } from '@afull/shared';
import { Button } from '../ui/button.js';
import { formatearGs } from '../../lib/formato.js';
import { CONCEPTO } from './etiquetas.js';

type Props = {
  items: PresupuestoItemFila[];
  margenPct: number;
  totalCongelado: number | null;
  ivaCongelado: number | null;
  precioFinal: number | null;
  editable: boolean;
  onEditar: (i: PresupuestoItemFila) => void;
  onAlternarActivo: (i: PresupuestoItemFila) => void;
};

const cant = (n: number) => n.toLocaleString('es-PY', { maximumFractionDigits: 4 });

/**
 * Ítems agrupados por sucursal. El total "en vivo" usa la MISMA fórmula exacta que el servidor;
 * una vez enviado se muestra el total congelado de la base.
 */
export function TablaItems({ items, margenPct, totalCongelado, ivaCongelado, precioFinal, editable, onEditar, onAlternarActivo }: Props) {
  const visibles = editable ? items : items.filter((i) => i.activo);
  const activos = items.filter((i) => i.activo);
  const calculado = activos.length ? calcularTotalPresupuesto(activos, margenPct) : 0;
  const neto = totalCongelado ?? precioFinal ?? calculado;
  const iva = ivaCongelado ?? calcularIvaGs(neto);
  const base = activos.reduce((a, i) => a + i.cantidad * i.precio_unitario_gs, 0);

  if (visibles.length === 0) {
    return <p className="py-6 text-center text-xs text-neutral-500">Todavía no hay ítems. Agregá el primero.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-[11px] uppercase tracking-wider text-neutral-500">
            <tr className="border-b border-[#1f2937]">
              <th className="py-2 pr-2">Sucursal</th>
              <th className="py-2 pr-2">Concepto</th>
              <th className="py-2 pr-2">Descripción</th>
              <th className="py-2 pr-2 text-right">Cant.</th>
              <th className="py-2 pr-2 text-right">Precio unit.</th>
              <th className="py-2 pr-2 text-right">Subtotal</th>
              {editable && <th className="py-2 w-16" />}
            </tr>
          </thead>
          <tbody>
            {visibles.map((i) => (
              <tr key={i.id} className={`border-b border-[#1f2937]/60 ${i.activo ? '' : 'opacity-40 line-through'}`}>
                <td className="py-2 pr-2 text-neutral-300">{i.sucursal_nombre ?? '—'}</td>
                <td className="py-2 pr-2 text-neutral-400">{CONCEPTO[i.concepto]}</td>
                <td className="py-2 pr-2 text-white">{i.descripcion}</td>
                <td className="py-2 pr-2 text-right font-mono">{cant(i.cantidad)} {i.unidad.toLowerCase()}</td>
                <td className="py-2 pr-2 text-right font-mono">{formatearGs(i.precio_unitario_gs)}</td>
                <td className="py-2 pr-2 text-right font-mono text-neutral-200">{formatearGs(i.subtotal_gs ?? i.cantidad * i.precio_unitario_gs)}</td>
                {editable && (
                  <td className="py-2 text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" title="Editar ítem" className="h-7 w-7 p-0" onClick={() => onEditar(i)}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" title={i.activo ? 'Quitar ítem' : 'Volver a incluir'} className="h-7 w-7 p-0" onClick={() => onAlternarActivo(i)}>
                      {i.activo ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="ml-auto w-full max-w-xs space-y-1 text-xs">
        <div className="flex justify-between text-neutral-400"><span>Costo (suma de ítems)</span><span className="font-mono">{formatearGs(base)}</span></div>
        <div className="flex justify-between text-neutral-400"><span>Margen sobre venta</span><span className="font-mono">{margenPct.toLocaleString('es-PY')} %</span></div>
        {precioFinal !== null && totalCongelado === null && (
          <div className="flex justify-between text-neutral-500"><span>Calculado</span><span className="font-mono">{formatearGs(calculado)}</span></div>
        )}
        <div className="flex justify-between text-neutral-200"><span>Precio sin IVA</span><span className="font-mono" data-testid="neto-presupuesto">{formatearGs(neto)}</span></div>
        <div className="flex justify-between text-neutral-400"><span>IVA 10 %</span><span className="font-mono">{formatearGs(iva)}</span></div>
        <div className="flex justify-between border-t border-[#1f2937] pt-1 text-sm font-semibold text-white">
          <span>Total {totalCongelado === null ? '(estimado)' : ''}</span>
          <span className="font-mono text-[#ea580c]" data-testid="total-presupuesto">{formatearGs(neto + iva)}</span>
        </div>
      </div>
    </div>
  );
}
