/** Color del margen real: rojo si se perdió plata, ámbar si quedó por debajo del 20 %, verde si no. */
export function claseMargen(m: number | null): string {
  if (m === null) return 'text-neutral-500';
  if (m < 0) return 'text-red-400';
  if (m < 20) return 'text-amber-400';
  return 'text-emerald-400';
}
export const textoMargen = (m: number | null) => (m === null ? '—' : `${m.toLocaleString('es-PY', { maximumFractionDigits: 2 })} %`);
