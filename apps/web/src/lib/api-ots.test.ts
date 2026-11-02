import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  obtenerOTs,
  obtenerOT,
  crearOT,
  editarOT,
  transicionarOT,
} from './api-ots.js';

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

describe('api-ots: métodos y rutas alineados con Hono', () => {
  it('obtenerOTs arma query params y usa GET', async () => {
    const fn = mockFetch();

    await obtenerOTs({
      q: 'zz_test',
      estado: 'PENDIENTE',
      clienteId: '123e4567-e89b-12d3-a456-426614174000',
      desde: '2026-11-01',
      hasta: '2026-11-05',
      pagina: 2,
    });

    expect(fn).toHaveBeenCalledWith(
      '/api/comercial/ot?q=zz_test&estado=PENDIENTE&clienteId=123e4567-e89b-12d3-a456-426614174000&desde=2026-11-01&hasta=2026-11-05&pagina=2',
      expect.anything()
    );
  });

  it('obtenerOT usa GET /api/comercial/ot/:id', async () => {
    const fn = mockFetch();
    await obtenerOT('ot-123');
    expect(fn).toHaveBeenCalledWith('/api/comercial/ot/ot-123', expect.anything());
  });

  it('crearOT usa POST /api/comercial/ot', async () => {
    const fn = mockFetch();
    await crearOT({
      clienteId: '123e4567-e89b-12d3-a456-426614174000',
      titulo: 'Letrero LED',
    });
    expect(fn).toHaveBeenCalledWith(
      '/api/comercial/ot',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('editarOT usa PATCH /api/comercial/ot/:id (regla de auditoría E2)', async () => {
    const fn = mockFetch();
    await editarOT('ot-123', {
      titulo: 'Letrero Editado',
      updatedAt: '2026-11-02T12:00:00.000Z',
    });
    expect(fn).toHaveBeenCalledWith(
      '/api/comercial/ot/ot-123',
      expect.objectContaining({ method: 'PATCH' })
    );
  });

  it('transicionarOT usa POST /api/comercial/ot/:id/transicionar', async () => {
    const fn = mockFetch();
    await transicionarOT('ot-123', {
      desde: 'PENDIENTE',
      a: 'EN_DISENO',
      comentario: 'Iniciando diseño',
    });
    expect(fn).toHaveBeenCalledWith(
      '/api/comercial/ot/ot-123/transicionar',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
