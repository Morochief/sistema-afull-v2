import { describe, it, expect, vi, afterEach } from 'vitest';
import * as ins from './api-insumos.js';

const fetchOriginal = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchOriginal;
});
function mockFetch() {
  const fn = vi.fn().mockResolvedValue({ ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({}) });
  globalThis.fetch = fn;
  return fn;
}
const casos: [string, () => Promise<unknown>, string, string][] = [
  ['buscar', () => ins.buscarInsumos(' lona '), '/api/insumos?q=lona', 'GET'],
  ['crear', () => ins.crearInsumo({ nombre: 'x', unidad: 'M2', costoUnitarioGs: 1 }), '/api/insumos', 'POST'],
  ['editar', () => ins.editarInsumo('i1', { activo: false }), '/api/insumos/i1', 'PATCH'],
  ['precio', () => ins.nuevoPrecioInsumo('i1', 2), '/api/insumos/i1/precios', 'POST'],
  ['por OT', () => ins.consumosDeOT('o1'), '/api/consumos/ot/o1', 'GET'],
  ['cargar', () => ins.cargarConsumo({ otId: 'o', insumoId: 'i', cantidad: 1, claveIdempotencia: 'k' }), '/api/consumos', 'POST'],
  ['merma', () => ins.cargarMerma({ otId: 'o', insumoId: 'i', anchoMaterialM: 1, largoUsadoM: 1, piezas: [], claveIdempotencia: 'k' }), '/api/consumos/merma', 'POST'],
  ['compartido', () => ins.cargarCompartido({ insumoId: 'i', cantidadTotal: 1, repartos: [], claveIdempotencia: 'k' }), '/api/consumos/compartido', 'POST'],
  ['anular', () => ins.anularConsumo('c1', 'm'), '/api/consumos/c1/anular', 'POST'],
];
describe('api-insumos: métodos y rutas alineados con Hono', () => {
  it.each(casos)('%s', async (_n, llamar, url, metodo) => {
    const fn = mockFetch();
    await llamar();
    const [u, init] = fn.mock.calls[0] as [string, RequestInit | undefined];
    expect(u).toBe(url);
    expect(init?.method ?? 'GET').toBe(metodo);
  });
});
