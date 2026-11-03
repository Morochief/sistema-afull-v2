import { useState } from 'react';
import { toast } from 'sonner';
import { editarPresupuesto } from '../../lib/api-presupuestos.js';
import { mensajeDeError } from '../../lib/api.js';
import { numero } from '../../lib/numero.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';

const RAPIDOS = [25, 30, 35, 40];

type Props = { presupuestoId: string; margenPct: number; updatedAt: string; onCambio: () => void };

/**
 * Markup del borrador: recargo sobre el costo (precio sin IVA = costo × (1 + markup)).
 * Botones rápidos y un campo libre; se guarda con control de concurrencia (updatedAt → 409).
 */
export function SelectorMarkup({ presupuestoId, margenPct, updatedAt, onCambio }: Props) {
  const [libre, setLibre] = useState('');
  const [guardando, setGuardando] = useState(false);

  const guardar = async (valor: number) => {
    if (!(valor >= 0 && valor <= 999.99) || Math.round(valor * 100) !== valor * 100) {
      toast.error('Markup entre 0 y 999,99, con hasta 2 decimales');
      return;
    }
    setGuardando(true);
    try {
      await editarPresupuesto(presupuestoId, { margenPct: valor, updatedAt });
      setLibre('');
      onCambio();
    } catch (e) {
      toast.error(mensajeDeError(e, 'No se pudo cambiar el markup'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-neutral-400">Markup:</span>
      {RAPIDOS.map((m) => (
        <Button
          key={m}
          size="sm"
          variant={m === margenPct ? undefined : 'outline'}
          className="h-7 px-2.5 text-xs"
          disabled={guardando}
          onClick={() => void guardar(m)}
        >
          {m} %
        </Button>
      ))}
      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          void guardar(numero(libre));
        }}
      >
        <Input
          aria-label="Markup personalizado"
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
    </div>
  );
}
