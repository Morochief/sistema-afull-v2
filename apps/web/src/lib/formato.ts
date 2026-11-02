const formateadorGs = new Intl.NumberFormat('es-PY', {
  style: 'decimal',
  maximumFractionDigits: 0,
});

/**
 * Formatea un monto en Guaraníes sin decimales (Gs. 1.500.000).
 */
export function formatearGs(monto: number | bigint | null | undefined): string {
  if (monto === null || monto === undefined) return '-';
  const val = typeof monto === 'bigint' ? Number(monto) : monto;
  return `Gs. ${formateadorGs.format(val)}`;
}
