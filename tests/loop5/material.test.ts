import { describe, it, expect } from 'vitest';
import { calcularMerma, repartirCantidad, normalizarUnidad } from '../../packages/shared/src/index.js';

describe('Loop 5 — fórmulas de material', () => {
  it('merma de bobina: ejemplo de Edu (1,52 m × 1,60 m; 3 piezas de 1,00 × 0,50)', () => {
    const r = calcularMerma(1.52, 1.6, [{ anchoM: 1, altoM: 0.5, cantidad: 3 }]);
    expect(r).toEqual({ m2Usados: 2.432, m2Piezas: 1.5, m2Desperdicio: 0.932, aprovechamientoPct: 61.7 });
  });
  it('rechaza piezas que superan el material y cantidades no enteras', () => {
    expect(() => calcularMerma(1, 1, [{ anchoM: 2, altoM: 1, cantidad: 1 }])).toThrow(/más superficie/);
    expect(() => calcularMerma(1, 1, [{ anchoM: 0.1, altoM: 0.1, cantidad: 1.5 }])).toThrow();
  });
  it('plancha compartida: reparto proporcional exacto (Σ = total)', () => {
    const r = repartirCantidad(2, [1, 1, 1]); // 2 m² entre 3 OTs iguales
    expect(r.reduce((a, b) => a + b, 0)).toBeCloseTo(2, 10);
    expect(r.map((x) => Math.round(x * 1e4)).reduce((a, b) => a + b, 0)).toBe(20000);
    expect(repartirCantidad(1, [0.75, 0.25])).toEqual([0.75, 0.25]);
  });
  it('normaliza las unidades de la planilla', () => {
    expect(['el m2', 'M2', 'Plancha', 'rollo 25 m', 'Min', 'Litro', 'el metro', 'None'].map(normalizarUnidad))
      .toEqual(['M2', 'M2', 'PLANCHA', 'ROLLO', 'MINUTO', 'LITRO', 'METRO', null]);
  });
});
