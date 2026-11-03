/**
 * Fórmulas del presupuesto en aritmética EXACTA (BigInt con escala fija).
 * Nunca `float` para guaraníes: con float, 170 × 1,15 = 195,4999… y redondea a 195 en vez de 196.
 * Escalas: cantidad y precio NUMERIC(·,4) → escala 4; margen NUMERIC(5,2) → escala 2;
 * subtotal y base → escala 8. Un solo redondeo (mitad hacia arriba) al calcular el total.
 * Los valores llegan como number o como string (postgres-js devuelve NUMERIC como string).
 */
export type Decimal = number | string;

export interface ItemCalculoPresupuesto {
  cantidad: Decimal;
  precio_unitario_gs: Decimal;
  sucursal_id?: string | null;
  activo?: boolean;
}

const E8 = 100_000_000n;

/** Convierte un decimal a entero escalado; rechaza más decimales que la escala (no trunca en silencio). */
export function aEscalado(valor: Decimal, escala: number): bigint {
  const s = typeof valor === 'number' ? valor.toString() : valor.trim();
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error(`Valor decimal inválido: ${s}`);
  const frac = (m[3] ?? '').replace(/0+$/, '');
  if (frac.length > escala) throw new Error(`Más de ${escala} decimales: ${s}`);
  const n = BigInt(m[2] + frac.padEnd(escala, '0'));
  return m[1] === '-' ? -n : n;
}

/** División entera redondeando mitad hacia arriba (valores no negativos). */
function dividirRedondeando(n: bigint, d: bigint): bigint {
  const q = n / d;
  return (n % d) * 2n >= d ? q + 1n : q;
}

function subtotal8(item: ItemCalculoPresupuesto): bigint {
  return aEscalado(item.cantidad, 4) * aEscalado(item.precio_unitario_gs, 4);
}

function activos(items: readonly ItemCalculoPresupuesto[]) {
  return items.filter((i) => i.activo !== false);
}

/** Aplica el margen a una base escala 8 y devuelve guaraníes enteros (único redondeo). */
function conMargen(base8: bigint, margenPct: Decimal): bigint {
  const factor4 = 10_000n + aEscalado(margenPct, 2) * 1n; // (1 + m/100) en escala 4
  return dividirRedondeando(base8 * factor4, E8 * 10_000n);
}

/** Subtotal de un ítem, solo para mostrar (no se usa para sumar). */
export function calcularSubtotalItem(cantidad: Decimal, precioUnitarioGs: Decimal): number {
  return Number(aEscalado(cantidad, 4) * aEscalado(precioUnitarioGs, 4)) / Number(E8);
}

/** Base sin margen, solo para mostrar. */
export function calcularBaseImponible(items: readonly ItemCalculoPresupuesto[]): number {
  const base8 = activos(items).reduce((acc, i) => acc + subtotal8(i), 0n);
  return Number(base8) / Number(E8);
}

/** Total en guaraníes enteros: Σ subtotales exactos × (1 + margen), redondeado una sola vez. */
export function calcularTotalPresupuesto(items: readonly ItemCalculoPresupuesto[], margenPct: Decimal): number {
  const base8 = activos(items).reduce((acc, i) => acc + subtotal8(i), 0n);
  return Number(conMargen(base8, margenPct));
}

export interface RepartoSucursal {
  sucursalId: string | null;
  baseGs: number;
  montoOtGs: number;
}

/**
 * Reparte `totalGs` entre las sucursales. Cada una recibe su parte redondeada y el resto
 * se ajusta en la de mayor base: Σ montoOtGs === totalGs, exacto.
 */
export function repartirMontoPorSucursal(
  items: readonly ItemCalculoPresupuesto[],
  margenPct: Decimal,
  totalGs: number
): RepartoSucursal[] {
  const grupos = new Map<string | null, bigint>();
  for (const item of activos(items)) {
    const suc = item.sucursal_id ?? null;
    grupos.set(suc, (grupos.get(suc) ?? 0n) + subtotal8(item));
  }
  const filas = [...grupos.entries()].map(([sucursalId, base8]) => ({
    sucursalId,
    base8,
    monto: grupos.size === 1 ? BigInt(totalGs) : conMargen(base8, margenPct),
  }));
  if (filas.length === 0) return [];

  const diferencia = BigInt(totalGs) - filas.reduce((acc, f) => acc + f.monto, 0n);
  if (diferencia !== 0n) {
    const mayor = filas.reduce((a, f) => (f.base8 > a.base8 ? f : a), filas[0]);
    mayor.monto += diferencia;
  }
  return filas.map((f) => ({
    sucursalId: f.sucursalId,
    baseGs: Number(f.base8) / Number(E8),
    montoOtGs: Number(f.monto),
  }));
}
