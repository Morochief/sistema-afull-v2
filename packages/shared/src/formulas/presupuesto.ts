export interface ItemCalculoPresupuesto {
  cantidad: number;
  precio_unitario_gs: number;
  sucursal_id?: string | null;
  activo?: boolean;
}

export function calcularSubtotalItem(cantidad: number, precioUnitarioGs: number): number {
  return cantidad * precioUnitarioGs;
}

export function calcularBaseImponible(items: readonly ItemCalculoPresupuesto[]): number {
  return items
    .filter((i) => i.activo !== false)
    .reduce((acc, item) => acc + calcularSubtotalItem(item.cantidad, item.precio_unitario_gs), 0);
}

export function calcularTotalPresupuesto(baseGs: number, margenPct: number): number {
  return Math.round(baseGs * (1 + margenPct / 100));
}

export interface RepartoSucursal {
  sucursalId: string | null;
  baseGs: number;
  montoOtGs: number;
}

export function repartirMontoPorSucursal(
  items: readonly ItemCalculoPresupuesto[],
  margenPct: number,
  totalGs: number
): RepartoSucursal[] {
  const itemsActivos = items.filter((i) => i.activo !== false);
  if (itemsActivos.length === 0) return [];

  // Agrupar base por sucursal_id
  const grupos = new Map<string | null, number>();
  for (const item of itemsActivos) {
    const suc = item.sucursal_id ?? null;
    const subtotal = calcularSubtotalItem(item.cantidad, item.precio_unitario_gs);
    grupos.set(suc, (grupos.get(suc) ?? 0) + subtotal);
  }

  // Si solo hay un grupo (o ninguno con sucursal), se lleva el total entero
  if (grupos.size === 1) {
    const [sucursalId, base] = Array.from(grupos.entries())[0];
    return [{ sucursalId, baseGs: base, montoOtGs: totalGs }];
  }

  // Múltiples sucursales: calcular monto redondeado para cada una
  const resultados: RepartoSucursal[] = [];
  let sumaMontos = 0;
  for (const [sucursalId, baseGs] of grupos.entries()) {
    const montoOtGs = Math.round(baseGs * (1 + margenPct / 100));
    sumaMontos += montoOtGs;
    resultados.push({ sucursalId, baseGs, montoOtGs });
  }

  // Ajuste del resto en la sucursal de mayor base
  const diferencia = totalGs - sumaMontos;
  if (diferencia !== 0 && resultados.length > 0) {
    let indiceMayor = 0;
    for (let i = 1; i < resultados.length; i++) {
      if (resultados[i].baseGs > resultados[indiceMayor].baseGs) {
        indiceMayor = i;
      }
    }
    resultados[indiceMayor].montoOtGs += diferencia;
  }

  return resultados;
}
