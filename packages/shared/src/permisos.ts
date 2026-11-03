/**
 * Quién ve dinero (costos, precios, tarifas por km, totales de material): solo admin y comercial.
 * Decisión del usuario (2026-11-03): los operarios (taller, montaje, diseño) nunca ven precios.
 * La API es la que filtra; la web usa esto solo para no dibujar huecos.
 */
export function puedeVerCostos(capacidades: readonly string[]): boolean {
  return capacidades.includes('admin') || capacidades.includes('comercial');
}
