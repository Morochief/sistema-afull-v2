import { describe, it, expect, vi, afterEach } from 'vitest';
import { obtenerEstadoLive } from './api-live.js';

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

describe('api-live: métodos y rutas', () => {
  it('obtenerEstadoLive usa GET /api/live/estado', async () => {
    const fn = mockFetch();
    await obtenerEstadoLive();
    expect(fn).toHaveBeenCalledWith('/api/live/estado', expect.anything());
  });
});
