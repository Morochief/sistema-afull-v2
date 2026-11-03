import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  obtenerTareasOT,
  crearTareaOT,
  editarTarea,
  cancelarTarea,
} from './api-tareas.js';

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

describe('api-tareas: métodos y rutas', () => {
  it('obtenerTareasOT usa GET /api/comercial/ot/:id/tareas', async () => {
    const fn = mockFetch();
    await obtenerTareasOT('ot-123');
    expect(fn).toHaveBeenCalledWith('/api/comercial/ot/ot-123/tareas', expect.anything());
  });

  it('crearTareaOT usa POST /api/comercial/ot/:id/tareas', async () => {
    const fn = mockFetch();
    await crearTareaOT('ot-123', {
      tipo: 'TALLER_CORTE',
      descripcion: 'Cortar plancha de acrílico',
    });
    expect(fn).toHaveBeenCalledWith(
      '/api/comercial/ot/ot-123/tareas',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('editarTarea usa PATCH /api/tareas/:id', async () => {
    const fn = mockFetch();
    await editarTarea('tar-1', {
      descripcion: 'Corte láser',
      updatedAt: '2026-11-02T12:00:00Z',
    });
    expect(fn).toHaveBeenCalledWith(
      '/api/tareas/tar-1',
      expect.objectContaining({ method: 'PATCH' })
    );
  });

  it('cancelarTarea usa POST /api/tareas/:id/cancelar', async () => {
    const fn = mockFetch();
    await cancelarTarea('tar-1', {
      desde: 'PENDIENTE',
      comentario: 'Cancelado por cambio de diseño',
    });
    expect(fn).toHaveBeenCalledWith(
      '/api/tareas/tar-1/cancelar',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
