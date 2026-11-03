import { describe, it, expect } from 'vitest';
import {
  puedeTransicionarPresupuesto,
  esEstadoPresupuestoFinal,
  transicionesPresupuestoDesde,
  calcularSubtotalItem,
  calcularBaseImponible,
  calcularTotalPresupuesto,
  repartirMontoPorSucursal,
} from '../../packages/shared/src/index.js';

describe('L3.E1 — Máquina de Estados de Presupuesto', () => {
  it('permite transicionar desde BORRADOR a ENVIADO y ANULADO', () => {
    expect(puedeTransicionarPresupuesto('BORRADOR', 'ENVIADO')).toBe(true);
    expect(puedeTransicionarPresupuesto('BORRADOR', 'ANULADO')).toBe(true);
    expect(puedeTransicionarPresupuesto('BORRADOR', 'APROBADO')).toBe(false);
  });

  it('permite transicionar desde ENVIADO a APROBADO, RECHAZADO o REEMPLAZADO', () => {
    expect(puedeTransicionarPresupuesto('ENVIADO', 'APROBADO')).toBe(true);
    expect(puedeTransicionarPresupuesto('ENVIADO', 'RECHAZADO')).toBe(true);
    expect(puedeTransicionarPresupuesto('ENVIADO', 'REEMPLAZADO')).toBe(true);
    expect(puedeTransicionarPresupuesto('ENVIADO', 'BORRADOR')).toBe(false);
  });

  it('identifica correctamente los estados finales', () => {
    expect(esEstadoPresupuestoFinal('APROBADO')).toBe(true);
    expect(esEstadoPresupuestoFinal('RECHAZADO')).toBe(true);
    expect(esEstadoPresupuestoFinal('REEMPLAZADO')).toBe(true);
    expect(esEstadoPresupuestoFinal('ANULADO')).toBe(true);
    expect(esEstadoPresupuestoFinal('BORRADOR')).toBe(false);
    expect(esEstadoPresupuestoFinal('ENVIADO')).toBe(false);
  });

  it('devuelve las transiciones válidas desde cada estado', () => {
    expect(transicionesPresupuestoDesde('BORRADOR')).toEqual(['ENVIADO', 'ANULADO']);
    expect(transicionesPresupuestoDesde('ENVIADO')).toEqual(['APROBADO', 'RECHAZADO', 'REEMPLAZADO']);
    expect(transicionesPresupuestoDesde('APROBADO')).toEqual([]);
  });
});

describe('L3.E1 — Fórmulas de Presupuesto y Reparto por Sucursal', () => {
  it('calcula subtotal de ítem con precisión sin redondear antes de tiempo', () => {
    expect(calcularSubtotalItem(2.5, 15000)).toBe(37500);
    expect(calcularSubtotalItem(3, 33333.3333)).toBeCloseTo(100000, 2);
  });

  it('calcula base imponible sumando solo ítems activos', () => {
    const items = [
      { cantidad: 2, precio_unitario_gs: 50000, activo: true },
      { cantidad: 1, precio_unitario_gs: 30000, activo: false },
      { cantidad: 4, precio_unitario_gs: 25000 },
    ];
    expect(calcularBaseImponible(items)).toBe(200000);
  });

  it('calcula total con margen aplicando un único redondeo', () => {
    expect(calcularTotalPresupuesto(100000, 35)).toBe(135000);
    expect(calcularTotalPresupuesto(100001, 35)).toBe(135001);
  });

  it('reparto por sucursal con división inexacta: la suma de montos da exactamente total_gs', () => {
    const items = [
      { sucursal_id: 'suc-1', cantidad: 1, precio_unitario_gs: 100000 },
      { sucursal_id: 'suc-2', cantidad: 1, precio_unitario_gs: 100000 },
      { sucursal_id: 'suc-3', cantidad: 1, precio_unitario_gs: 100001 },
    ];
    const base = calcularBaseImponible(items);
    const margenPct = 35;
    const totalGs = calcularTotalPresupuesto(base, margenPct);

    const reparto = repartirMontoPorSucursal(items, margenPct, totalGs);
    expect(reparto).toHaveLength(3);

    const sumaMontos = reparto.reduce((acc, r) => acc + r.montoOtGs, 0);
    expect(sumaMontos).toBe(totalGs);

    const suc3 = reparto.find((r) => r.sucursalId === 'suc-3');
    const suc1 = reparto.find((r) => r.sucursalId === 'suc-1');
    expect(suc3!.montoOtGs).toBeGreaterThanOrEqual(suc1!.montoOtGs);
  });

  it('reparto con una sola sucursal asigna el 100% de total_gs', () => {
    const items = [
      { sucursal_id: 'suc-unica', cantidad: 2, precio_unitario_gs: 50000 },
      { sucursal_id: 'suc-unica', cantidad: 1, precio_unitario_gs: 10000 },
    ];
    const totalGs = 148500;
    const reparto = repartirMontoPorSucursal(items, 35, totalGs);
    expect(reparto).toHaveLength(1);
    expect(reparto[0].montoOtGs).toBe(totalGs);
  });
});
