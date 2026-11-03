import { describe, it, expect, vi, afterEach } from 'vitest';
import * as c from './api-costeo.js';
import { claseMargen, textoMargen } from './margen.js';

const fetchOriginal = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

describe('api-costeo: rutas alineadas con Hono', () => {
  it.each([
    ['OT', () => c.costeoDeOT('o1'), '/api/costeo/ot/o1'],
    ['proyecto', () => c.costeoDeProyecto('p1'), '/api/costeo/proyecto/p1'],
    ['listado con filtros', () => c.listarRentabilidad({ q: ' OT-1 ', estado: 'TERMINADO', pagina: 2 }), '/api/costeo/ots?q=OT-1&estado=TERMINADO&pagina=2'],
    ['listado "todos" sin estado', () => c.listarRentabilidad({ estado: 'todos', pagina: 1 }), '/api/costeo/ots'],
  ] as [string, () => Promise<unknown>, string][])('%s', async (_n, llamar, url) => {
    const fn = vi.fn().mockResolvedValue({ ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({}) });
    globalThis.fetch = fn;
    await llamar();
    const [u, init] = fn.mock.calls[0] as [string, RequestInit | undefined];
    expect(u).toBe(url);
    expect(init?.method ?? 'GET').toBe('GET');
  });
});

describe('margen', () => {
  it('rojo si se perdió, ámbar debajo de 20 %, verde desde 20 %, gris sin venta', () => {
    expect(claseMargen(-0.01)).toContain('red');
    expect(claseMargen(19.99)).toContain('amber');
    expect(claseMargen(20)).toContain('emerald');
    expect(claseMargen(null)).toContain('neutral');
    expect(textoMargen(null)).toBe('—');
    expect(textoMargen(60)).toBe('60 %');
  });
});
