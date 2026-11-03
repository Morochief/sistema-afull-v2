import { useState } from 'react';
import { toast } from 'sonner';
import { editarPresupuesto } from '../../lib/api-presupuestos.js';
import { mensajeDeError } from '../../lib/api.js';
import { numero } from '../../lib/numero.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';

const RAPIDOS = [25, 30, 35, 40];
const fmt = (n: number) => n.toLocaleString('es-PY');

type Props = { presupuestoId: string; margenPct: number; precioFinalGs: number | null; updatedAt: string; onCambio: () => void };

/**
 * Margen SOBRE LA VENTA del borrador (precio sin IVA = costo ÷ (1 − margen), como en las planillas: costo ÷ 0,70)
 * y precio final redondeado a mano (opcional). Se guarda con control de concurrencia (updatedAt → 409).
 */
export function SelectorMarkup({ presupuestoId, margenPct, precioFinalGs, updatedAt, onCambio }: Props) {
  const [libre, setLibre] = useState('');
  const [guardando, setGuardando] = useState(false);

  const [redondeo, setRedondeo] = useState('');
  const patch = async (d: { margenPct?: number; precioFinalGs?: number | null }) => {
    setGuardando(true);
    try {
      await editarPresupuesto(presupuestoId, { ...d, updatedAt });
      setRedondeo('');
      setLibre('');
      onCambio();
    } catch (e) {
      toast.error(mensajeDeError(e, 'No se pudo guardar'));
    } finally {
      setGuardando(false);
    }
  };
  const guardar = (valor: number) => {
    if (!(valor >= 0 && valor < 100) || Math.round(valor * 100) !== valor * 100) {
      toast.error('Margen sobre la venta: de 0 a 99,99 %, con hasta 2 decimales');
      return;
    }
    void patch({ margenPct: valor });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-neutral-400">Margen sobre venta:</span>
      {RAPIDOS.map((m) => (
        <Button
          key={m}
          size="sm"
          variant={m === margenPct ? undefined : 'outline'}
          className="h-7 px-2.5 text-xs"
          disabled={guardando}
          onClick={() => guardar(m)}
        >
          {m} %
        </Button>
      ))}
      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          guardar(numero(libre));
        }}
      >
        <Input
          aria-label="Margen personalizado"
          placeholder={RAPIDOS.includes(margenPct) ? 'Otro %' : `${String(margenPct).replace('.', ',')} %`}
          value={libre}
          onChange={(e) => setLibre(e.target.value)}
          className="h-7 w-20 text-xs"
          inputMode="decimal"
        />
        <Button type="submit" size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={guardando || !libre.trim()}>
          Aplicar
        </Button>
      </form>
      <form
        className="flex items-center gap-1 sm:ml-4"
        onSubmit={(e) => {
          e.preventDefault();
          const v = numero(redondeo);
          if (!(v > 0) || !Number.isInteger(v)) toast.error('Precio en guaraníes enteros');
          else void patch({ precioFinalGs: v });
        }}
      >
        <span className="text-neutral-400">Precio final:</span>
        <Input aria-label="Precio final redondeado" placeholder={precioFinalGs ? fmt(precioFinalGs) : 'Redondear a…'} value={redondeo}
          onChange={(e) => setRedondeo(e.target.value)} className="h-7 w-28 text-xs" inputMode="numeric" />
        <Button type="submit" size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={guardando || !redondeo.trim()}>Fijar</Button>
        {precioFinalGs !== null && (
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={guardando} onClick={() => void patch({ precioFinalGs: null })}>Quitar</Button>
        )}
      </form>
    </div>
  );
}
