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

import { admin, cerrarConexiones } from '../loop0/helpers.js';
import { sesion } from '../loop3/helpers-comercial.js';
import { afterAll } from 'vitest';

afterAll(cerrarConexiones);

describe('0010 — diseño como tarea con cronómetro (Nachi registra su tiempo como todos)', () => {
  it('una tarea DISENO se crea, y la diseñadora con capacidad diseno accede a Mi trabajo', async () => {
    const com = await sesion(['comercial']);
    const tag = crypto.randomUUID().slice(0, 8);
    const [c] = await admin`INSERT INTO cliente (codigo, nombre) VALUES (${'ZD' + tag}, ${'zz_test_cli_dis_' + tag}) RETURNING id`;
    const ot = await com('POST', '/api/comercial/ot', {
      clienteId: c.id, titulo: 'zz_test Ruleta', tareas: [{ tipo: 'DISENO', descripcion: 'Diseño ruleta' }],
    });
    expect(ot.status).toBe(201);
    const nachi = await sesion(['diseno']);
    // Sin persona vinculada responde 403 "no vinculado", pero NO por falta de capacidad.
    const r = await nachi('GET', '/api/mi-trabajo');
    expect(String(r.j.error ?? '')).not.toMatch(/requiere capacidad/);
  });
});
