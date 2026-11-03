import { describe, it, expect } from 'vitest';
import {
  puedeTransicionarPresupuesto,
  esEstadoPresupuestoFinal,
  transicionesPresupuestoDesde,
  calcularSubtotalItem,
  calcularBaseImponible,
  calcularTotalPresupuesto,
  repartirMontoPorSucursal,
  calcularIvaGs,
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
    expect(calcularTotalPresupuesto([{ cantidad: 1, precio_unitario_gs: 100000 }], 35)).toBe(135000);
    expect(calcularTotalPresupuesto([{ cantidad: 1, precio_unitario_gs: 100001 }], 35)).toBe(135001);
  });

  it('(auditoría) aritmética exacta: 170 × 1,15 = 195,5 redondea a 196 (en float daba 195)', () => {
    expect(calcularTotalPresupuesto([{ cantidad: 1, precio_unitario_gs: 170 }], 15)).toBe(196);
    expect(calcularTotalPresupuesto([{ cantidad: 1, precio_unitario_gs: 870 }], 15)).toBe(1001);
    // 3 × 33333,3333 = 99999,9999 exacto; con margen 0 redondea a 100000
    expect(calcularTotalPresupuesto([{ cantidad: 3, precio_unitario_gs: '33333.3333' }], '0.00')).toBe(100000);
  });

  it('(auditoría) acepta NUMERIC como string (postgres-js) y rechaza más de 4 decimales', () => {
    expect(calcularTotalPresupuesto([{ cantidad: '2.5000', precio_unitario_gs: '15000.0000' }], '35.00')).toBe(50625);
    expect(() => calcularTotalPresupuesto([{ cantidad: '1.00001', precio_unitario_gs: 1 }], 0)).toThrow();
  });

  it('IVA 10 % aparte sobre el precio sin IVA, mitad hacia arriba', () => {
    expect(calcularIvaGs(1_250_000)).toBe(125_000);
    expect(calcularIvaGs(196)).toBe(20);
    expect(calcularIvaGs(194)).toBe(19);
    expect(calcularIvaGs(0)).toBe(0);
  });

  it('(auditoría) el resto del redondeo se ajusta de verdad: 3 sucursales de 1 Gs con 50 %', () => {
    const items = ['a', 'b', 'c'].map((s) => ({ sucursal_id: s, cantidad: 1, precio_unitario_gs: 1 }));
    const total = calcularTotalPresupuesto(items, 50); // 4,5 → 5
    expect(total).toBe(5);
    const reparto = repartirMontoPorSucursal(items, 50, total); // cada una 1,5 → 2; suma 6 → ajuste −1
    expect(reparto.reduce((a, r) => a + r.montoOtGs, 0)).toBe(5);
    expect(reparto.map((r) => r.montoOtGs).sort()).toEqual([1, 2, 2]);
  });

  it('reparto por sucursal con división inexacta: la suma de montos da exactamente total_gs', () => {
    const items = [
      { sucursal_id: 'suc-1', cantidad: 1, precio_unitario_gs: 100000 },
      { sucursal_id: 'suc-2', cantidad: 1, precio_unitario_gs: 100000 },
      { sucursal_id: 'suc-3', cantidad: 1, precio_unitario_gs: 100001 },
    ];
    const margenPct = 35;
    const totalGs = calcularTotalPresupuesto(items, margenPct);

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
