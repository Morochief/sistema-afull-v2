import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';

export type FilaPieza = { ancho: string; alto: string; cantidad: string };
export type FilaTrabajo = { otId: string; tareaId?: string; codigo: string; etiqueta: string; piezas: FilaPieza[] };
export const PIEZA_VACIA: FilaPieza = { ancho: '', alto: '', cantidad: '1' };

/** Un trabajo del corte (Loop 18): su OT y sus piezas en cm, con lo que le toca (piezas + parte del desperdicio). */
export function TrabajoCorte({ t, parte, onCambiar, onQuitar }: {
  t: FilaTrabajo; parte: string | null; onCambiar: (t: FilaTrabajo) => void; onQuitar?: () => void;
}) {
  const cambiar = (i: number, k: keyof FilaPieza, v: string) => onCambiar({ ...t, piezas: t.piezas.map((p, j) => (j === i ? { ...p, [k]: v } : p)) });
  return (
    <div className="space-y-1.5 rounded border border-[#1f2937] p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1 truncate font-semibold text-neutral-200">{t.etiqueta}</span>
        {onQuitar && <button type="button" className="text-neutral-500 hover:text-red-400" onClick={onQuitar} aria-label={`Quitar ${t.codigo}`}><Trash2 className="h-3.5 w-3.5" /></button>}
      </div>
      {t.piezas.map((p, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input aria-label={`Ancho pieza ${i + 1} de ${t.codigo}`} inputMode="decimal" placeholder="Ancho cm" value={p.ancho} onChange={(e) => cambiar(i, 'ancho', e.target.value)} />
          <span className="text-neutral-500">×</span>
          <Input aria-label={`Alto pieza ${i + 1} de ${t.codigo}`} inputMode="decimal" placeholder="Alto cm" value={p.alto} onChange={(e) => cambiar(i, 'alto', e.target.value)} />
          <span className="text-neutral-500">×</span>
          <div className="w-14 shrink-0">
            <Input aria-label={`Cantidad pieza ${i + 1} de ${t.codigo}`} inputMode="numeric" value={p.cantidad} onChange={(e) => cambiar(i, 'cantidad', e.target.value)} />
          </div>
          {t.piezas.length > 1 && (
            <button type="button" className="shrink-0 text-neutral-500 hover:text-red-400" aria-label={`Quitar pieza ${i + 1} de ${t.codigo}`}
              onClick={() => onCambiar({ ...t, piezas: t.piezas.filter((_, j) => j !== i) })}><Trash2 className="h-3.5 w-3.5" /></button>
          )}
        </div>
      ))}
      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-1 text-xs" onClick={() => onCambiar({ ...t, piezas: [...t.piezas, { ...PIEZA_VACIA }] })}>
          <Plus className="h-3.5 w-3.5" /> Pieza
        </Button>
        {parte && <span className="text-[11px] text-neutral-400" data-testid={`parte-${t.codigo}`}>{parte}</span>}
      </div>
    </div>
  );
}
