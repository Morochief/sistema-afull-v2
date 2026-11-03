import { describe, it, expect, vi, afterEach } from 'vitest';
import { versionesDiseno, subirDiseno, aprobarDiseno, observarDiseno, disenosPorRevisar, colaProduccion } from './api-disenos.js';

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
const llamada = (fn: ReturnType<typeof vi.fn>) => {
  const [url, init] = fn.mock.calls[0] as [string, RequestInit | undefined];
  return { url, metodo: init?.method ?? 'GET' };
};

describe('api-disenos: métodos y rutas alineados con Hono', () => {
  it('lecturas por GET', async () => {
    for (const [f, url] of [
      [() => versionesDiseno('ot1'), '/api/disenos/ot/ot1'],
      [disenosPorRevisar, '/api/disenos/pendientes'],
      [colaProduccion, '/api/disenos/cola'],
    ] as const) {
      const fn = mockFetch();
      await f();
      expect(llamada(fn)).toEqual({ url, metodo: 'GET' });
    }
  });
  it('mutaciones por POST', async () => {
    let fn = mockFetch();
    await subirDiseno('ot1', { origen: 'CLIENTE', driveUrl: 'https://drive.google.com/x' });
    expect(llamada(fn)).toEqual({ url: '/api/disenos/ot/ot1', metodo: 'POST' });
    fn = mockFetch();
    await aprobarDiseno('d1');
    expect(llamada(fn)).toEqual({ url: '/api/disenos/d1/aprobar', metodo: 'POST' });
    fn = mockFetch();
    await observarDiseno('d1', 'medidas');
    expect(llamada(fn)).toEqual({ url: '/api/disenos/d1/observar', metodo: 'POST' });
  });
});
