import { describe, it, expect } from 'vitest';
import { numero } from './numero.js';

describe('numero(): montos en formato paraguayo', () => {
  it('miles con punto y decimales con coma', () => {
    expect(numero('150.000')).toBe(150000);
    expect(numero('1.500.000')).toBe(1500000);
    expect(numero('2,5')).toBe(2.5);
    expect(numero('1.234,5678')).toBe(1234.5678);
  });
  it('punto decimal cuando no agrupa de a 3', () => {
    expect(numero('2.5')).toBe(2.5);
    expect(numero('33333.3333')).toBe(33333.3333);
  });
  it('rechaza más de 4 decimales y texto', () => {
    expect(numero('1,00001')).toBeNaN();
    expect(numero('abc')).toBeNaN();
    expect(numero('')).toBeNaN();
  });
});
