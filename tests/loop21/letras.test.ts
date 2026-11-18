import { describe, it, expect } from 'vitest';
import { montoEnLetras } from '../../packages/shared/src/formulas/letras.js';

/** Loop 21, CA-21.5: el monto del recibo en letras (guaraníes, sin decimales). */
describe('Loop 21 — monto en letras', () => {
  it.each([
    [321499, 'trescientos veintiún mil cuatrocientos noventa y nueve guaraníes'],
    [1, 'un guaraní'],
    [21, 'veintiún guaraníes'],
    [100, 'cien guaraníes'],
    [101, 'ciento un guaraníes'],
    [1000, 'mil guaraníes'],
    [21000, 'veintiún mil guaraníes'],
    [16000, 'dieciséis mil guaraníes'],
    [500500, 'quinientos mil quinientos guaraníes'],
    [1000000, 'un millón de guaraníes'],
    [2000000, 'dos millones de guaraníes'],
    [1250000, 'un millón doscientos cincuenta mil guaraníes'],
    [31331000, 'treinta y un millones trescientos treinta y un mil guaraníes'],
    [999999999, 'novecientos noventa y nueve millones novecientos noventa y nueve mil novecientos noventa y nueve guaraníes'],
    [1000000000, 'mil millones de guaraníes'],
  ])('%i → %s', (n, texto) => {
    expect(montoEnLetras(n)).toBe(texto);
  });

  it('cero, negativos y decimales no se aceptan (el recibo siempre es > 0 y en guaraníes enteros)', () => {
    expect(() => montoEnLetras(0)).toThrow();
    expect(() => montoEnLetras(-5)).toThrow();
    expect(() => montoEnLetras(10.5)).toThrow();
  });
});
