import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  obtenerMiTrabajo,
  iniciarTarea,
  pausarTarea,
  finalizarTarea,
} from './api-cronometro.js';

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

describe('api-cronometro: métodos y rutas', () => {
  it('obtenerMiTrabajo usa GET /api/mi-trabajo', async () => {
    const fn = mockFetch();
    await obtenerMiTrabajo();
    expect(fn).toHaveBeenCalledWith('/api/mi-trabajo', expect.anything());
  });

  it('iniciarTarea usa POST /api/mi-trabajo/tareas/:id/iniciar', async () => {
    const fn = mockFetch();
    await iniciarTarea('tar-1', '123e4567-e89b-12d3-a456-426614174000');
    expect(fn).toHaveBeenCalledWith(
      '/api/mi-trabajo/tareas/tar-1/iniciar',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('pausarTarea usa POST /api/mi-trabajo/tareas/:id/pausar', async () => {
    const fn = mockFetch();
    await pausarTarea('tar-1', {
      motivo: 'PAUSA',
      claveIdempotencia: '123e4567-e89b-12d3-a456-426614174000',
    });
    expect(fn).toHaveBeenCalledWith(
      '/api/mi-trabajo/tareas/tar-1/pausar',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('finalizarTarea usa POST /api/mi-trabajo/tareas/:id/finalizar', async () => {
    const fn = mockFetch();
    await finalizarTarea('tar-1', {
      comentario: 'Terminado con éxito',
      claveIdempotencia: '123e4567-e89b-12d3-a456-426614174000',
    });
    expect(fn).toHaveBeenCalledWith(
      '/api/mi-trabajo/tareas/tar-1/finalizar',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
