import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  crearSucursal,
  editarSucursal,
  cambiarEstadoSucursal,
  crearContacto,
  editarContacto,
  cambiarEstadoContacto,
  crearMarca,
  editarMarca,
  cambiarEstadoMarca,
} from './api-subrecursos.js';

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

describe('api-subrecursos: métodos y rutas alineados con la API', () => {
  it('sucursales usan POST, PATCH y PATCH estado', async () => {
    const fn = mockFetch();

    await crearSucursal('cli1', {
      nombre: 'Sucursal 1',
      ciudad: 'Asunción',
      gpsLat: -25.3,
      gpsLng: -57.6,
    });
    expect(fn).toHaveBeenCalledWith('/api/clientes/cli1/sucursales', expect.objectContaining({ method: 'POST' }));

    await editarSucursal('cli1', 'suc1', {
      nombre: 'Sucursal Edit',
      updatedAt: '2026-11-02T00:00:00.000Z',
    });
    expect(fn).toHaveBeenCalledWith('/api/clientes/cli1/sucursales/suc1', expect.objectContaining({ method: 'PATCH' }));

    await cambiarEstadoSucursal('cli1', 'suc1', false, '2026-11-02T00:00:00.000Z');
    expect(fn).toHaveBeenCalledWith('/api/clientes/cli1/sucursales/suc1/estado', expect.objectContaining({ method: 'PATCH' }));
  });

  it('contactos usan POST, PATCH y PATCH estado', async () => {
    const fn = mockFetch();

    await crearContacto('cli1', { nombre: 'Juan', esPrincipal: true });
    expect(fn).toHaveBeenCalledWith('/api/clientes/cli1/contactos', expect.objectContaining({ method: 'POST' }));

    await editarContacto('cli1', 'con1', { nombre: 'Juan Edit' });
    expect(fn).toHaveBeenCalledWith('/api/clientes/cli1/contactos/con1', expect.objectContaining({ method: 'PATCH' }));

    await cambiarEstadoContacto('cli1', 'con1', false);
    expect(fn).toHaveBeenCalledWith('/api/clientes/cli1/contactos/con1/estado', expect.objectContaining({ method: 'PATCH' }));
  });

  it('marcas usan POST, PATCH y PATCH estado', async () => {
    const fn = mockFetch();

    await crearMarca('cli1', { nombre: 'Marca A' });
    expect(fn).toHaveBeenCalledWith('/api/clientes/cli1/marcas', expect.objectContaining({ method: 'POST' }));

    await editarMarca('cli1', 'mar1', { nombre: 'Marca B' });
    expect(fn).toHaveBeenCalledWith('/api/clientes/cli1/marcas/mar1', expect.objectContaining({ method: 'PATCH' }));

    await cambiarEstadoMarca('cli1', 'mar1', false);
    expect(fn).toHaveBeenCalledWith('/api/clientes/cli1/marcas/mar1/estado', expect.objectContaining({ method: 'PATCH' }));
  });
});
