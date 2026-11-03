import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  obtenerPersonas,
  obtenerPersonasAsignables,
  obtenerUsuariosVinculables,
  crearPersona,
  editarPersona,
  cambiarEstadoPersona,
  vincularUsuarioPersona,
  obtenerTarifasPersona,
  crearTarifaPersona,
  cerrarTarifa,
} from './api-personas.js';

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

describe('api-personas: métodos y rutas', () => {
  it('obtenerPersonas arma query params y usa GET', async () => {
    const fn = mockFetch();
    await obtenerPersonas({ q: 'juan', activo: 'true', pagina: 2 });
    expect(fn).toHaveBeenCalledWith(
      '/api/personas?q=juan&activo=true&pagina=2',
      expect.anything()
    );
  });

  it('obtenerPersonasAsignables usa GET /api/personas/asignables', async () => {
    const fn = mockFetch();
    await obtenerPersonasAsignables('taller');
    expect(fn).toHaveBeenCalledWith(
      '/api/personas/asignables?q=taller',
      expect.anything()
    );
  });

  it('obtenerUsuariosVinculables usa GET /api/usuarios/vinculables', async () => {
    const fn = mockFetch();
    await obtenerUsuariosVinculables();
    expect(fn).toHaveBeenCalledWith('/api/usuarios/vinculables', expect.anything());
  });

  it('crearPersona usa POST /api/personas', async () => {
    const fn = mockFetch();
    await crearPersona({ nombre: 'Juan Pérez', ci: '123456' });
    expect(fn).toHaveBeenCalledWith(
      '/api/personas',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('editarPersona usa PATCH /api/personas/:id', async () => {
    const fn = mockFetch();
    await editarPersona('p-1', { nombre: 'Juan Modificado', updatedAt: '2026-11-02T12:00:00Z' });
    expect(fn).toHaveBeenCalledWith(
      '/api/personas/p-1',
      expect.objectContaining({ method: 'PATCH' })
    );
  });

  it('cambiarEstadoPersona usa PATCH /api/personas/:id/estado', async () => {
    const fn = mockFetch();
    await cambiarEstadoPersona('p-1', false, '2026-11-02T12:00:00Z');
    expect(fn).toHaveBeenCalledWith(
      '/api/personas/p-1/estado',
      expect.objectContaining({ method: 'PATCH' })
    );
  });

  it('vincularUsuarioPersona usa PATCH /api/personas/:id/usuario', async () => {
    const fn = mockFetch();
    await vincularUsuarioPersona('p-1', 'u-1');
    expect(fn).toHaveBeenCalledWith(
      '/api/personas/p-1/usuario',
      expect.objectContaining({ method: 'PATCH' })
    );
  });

  it('obtenerTarifasPersona usa GET /api/personas/:id/tarifas', async () => {
    const fn = mockFetch();
    await obtenerTarifasPersona('p-1');
    expect(fn).toHaveBeenCalledWith('/api/personas/p-1/tarifas', expect.anything());
  });

  it('crearTarifaPersona usa POST /api/personas/:id/tarifas', async () => {
    const fn = mockFetch();
    await crearTarifaPersona('p-1', { tarifaHoraGs: 50000, fechaInicio: '2026-11-01' });
    expect(fn).toHaveBeenCalledWith(
      '/api/personas/p-1/tarifas',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('cerrarTarifa usa PATCH /api/tarifas/:id/cerrar', async () => {
    const fn = mockFetch();
    await cerrarTarifa('t-1', { fechaFin: '2026-11-30' });
    expect(fn).toHaveBeenCalledWith(
      '/api/tarifas/t-1/cerrar',
      expect.objectContaining({ method: 'PATCH' })
    );
  });
});
