import { describe, it, expect } from 'vitest';
import { haversineM, distanciaRutaKm, alertaDesvio, evaluarGeocerca } from '../../packages/shared/src/index.js';

// Asunción centro ↔ Luque centro: ~13 km en línea recta (referencia conocida).
const ASU = { lat: -25.2822, lng: -57.635 };
const LUQUE = { lat: -25.2697, lng: -57.4873 };

describe('Loop 4 — fórmulas geográficas', () => {
  it('Haversine da la distancia correcta (Asunción–Luque ≈ 14,9 km)', () => {
    const km = haversineM(ASU, LUQUE) / 1000;
    expect(km).toBeGreaterThan(14.5);
    expect(km).toBeLessThan(15.3);
    expect(haversineM(ASU, ASU)).toBe(0);
  });

  it('ruta ida y vuelta × 1,35 no da 0 (el viaje circular que la línea recta inicio-fin perdería)', () => {
    const km = distanciaRutaKm([ASU, LUQUE, ASU]);
    expect(km).toBeGreaterThan(39);
    expect(km).toBeLessThan(42);
    expect(distanciaRutaKm([ASU])).toBe(0);
  });

  it('alerta de desvío informativa: solo sobre el umbral y con estimación', () => {
    expect(alertaDesvio(40, 40)).toBe(false);
    expect(alertaDesvio(52, 40)).toBe(false); // +30 % justo: no
    expect(alertaDesvio(60, 40)).toBe(true); // +50 %
    expect(alertaDesvio(500, null)).toBe(false);
  });

  it('geocerca de 100 m', () => {
    const sede = { lat: -25.320588, lng: -57.624181 };
    expect(evaluarGeocerca({ lat: -25.3206, lng: -57.6242 }, sede, 100).dentro).toBe(true);
    const lejos = evaluarGeocerca({ lat: -25.322, lng: -57.6242 }, sede, 100);
    expect(lejos.dentro).toBe(false);
    expect(lejos.distanciaM).toBeGreaterThan(100);
  });
});
