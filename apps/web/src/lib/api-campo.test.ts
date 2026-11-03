import { describe, it, expect, vi, afterEach } from 'vitest';
import * as campo from './api-campo.js';

const fetchOriginal = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

function mockFetch() {
  const fn = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => ({}),
  });
  globalThis.fetch = fn;
  return fn;
}

const casos: [string, () => Promise<unknown>, string, string][] = [
  ['vehículos', () => campo.listarVehiculos(), '/api/flota/vehiculos', 'GET'],
  ['crear vehículo', () => campo.crearVehiculo({ chapa: 'A', marcaModelo: 'B', costoKmGs: 0 }), '/api/flota/vehiculos', 'POST'],
  ['editar vehículo', () => campo.editarVehiculo('v1', { activo: false }), '/api/flota/vehiculos/v1', 'PATCH'],
  ['sedes', () => campo.listarSedes(), '/api/flota/sedes', 'GET'],
  ['editar sede', () => campo.editarSede('s1', { activo: false }), '/api/flota/sedes/s1', 'PATCH'],
  ['hojas', () => campo.listarHojasRuta('2026-11-01'), '/api/hojas-ruta?desde=2026-11-01', 'GET'],
  ['crear hoja', () => campo.crearHojaRuta({ fecha: '2026-11-03' }), '/api/hojas-ruta', 'POST'],
  ['persona en hoja', () => campo.agregarPersonaHoja('h1', { personaId: 'p', rol: 'MONTADOR' }), '/api/hojas-ruta/h1/personas', 'POST'],
  ['parada', () => campo.agregarParadaHoja('h1', { ordenTrabajoId: 'o' }), '/api/hojas-ruta/h1/paradas', 'POST'],
  ['mi día', () => campo.miDiaCampo(), '/api/campo/hoy', 'GET'],
  ['cerrar viaje', () => campo.cerrarViaje('v1', { kmFin: 1, claveIdempotencia: 'k' }), '/api/campo/viajes/v1/cerrar', 'POST'],
  ['completar', () => campo.completarParada('p1'), '/api/campo/paradas/p1/completar', 'POST'],
  ['omitir', () => campo.omitirParada('p1', 'm'), '/api/campo/paradas/p1/omitir', 'POST'],
];

describe('api-campo: métodos y rutas alineados con Hono', () => {
  it.each(casos)('%s', async (_n, llamar, url, metodo) => {
    const fn = mockFetch();
    await llamar();
    const [u, init] = fn.mock.calls[0] as [string, RequestInit | undefined];
    expect(u).toBe(url);
    expect(init?.method ?? 'GET').toBe(metodo);
  });
});
