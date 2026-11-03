import { describe, it, expect } from 'vitest';
import { rutaInicialSegunCapacidades, sanitizarDestinoVolver } from './rutas.js';

describe('rutas: redirección inicial según capacidades', () => {
  it('operario sin comercial va a /mi-trabajo', () => {
    expect(rutaInicialSegunCapacidades(['taller'])).toBe('/mi-trabajo');
    expect(rutaInicialSegunCapacidades(['montaje'])).toBe('/mi-trabajo');
    expect(rutaInicialSegunCapacidades(['taller', 'montaje'])).toBe('/mi-trabajo');
    expect(rutaInicialSegunCapacidades(['diseno'])).toBe('/mi-trabajo');
  });

  it('comercial va a /clientes', () => {
    expect(rutaInicialSegunCapacidades(['comercial'])).toBe('/clientes');
  });

  it('usuario con comercial y taller va a /clientes', () => {
    expect(rutaInicialSegunCapacidades(['comercial', 'taller'])).toBe('/clientes');
  });

  it('rrhh sin comercial va a /personas', () => {
    expect(rutaInicialSegunCapacidades(['rrhh'])).toBe('/personas');
  });

  it('admin va a /clientes', () => {
    expect(rutaInicialSegunCapacidades(['admin'])).toBe('/clientes');
  });

  it('sanitizarDestinoVolver respeta volver seguro o aplica regla de capacidades', () => {
    expect(sanitizarDestinoVolver('/ots/123', ['taller'])).toBe('/ots/123');
    expect(sanitizarDestinoVolver('//evil.com', ['taller'])).toBe('/mi-trabajo');
    expect(sanitizarDestinoVolver(undefined, ['taller'])).toBe('/mi-trabajo');
    expect(sanitizarDestinoVolver(undefined, ['comercial'])).toBe('/clientes');
  });
});
