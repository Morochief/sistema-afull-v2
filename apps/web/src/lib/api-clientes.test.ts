import { describe, it, expect, vi, afterEach } from 'vitest';
import { editarCliente, cambiarEstadoCliente, obtenerClientes } from './api-clientes.js';
import { ErrorApi, mensajeDeError } from './api.js';

// La API monta estas rutas con .patch() (apps/api/src/modules/clientes/routes.ts).
// Con PUT Hono responde 404: este test evita que el frontend vuelva a desalinearse.
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

describe('api-clientes: métodos y rutas iguales a la API', () => {
  it('editarCliente usa PATCH /api/clientes/:id', async () => {
    const fn = mockFetch();
    await editarCliente('abc', { nombre: 'X', updatedAt: '2026-11-02T00:00:00.000Z' });
    expect(fn).toHaveBeenCalledWith('/api/clientes/abc', expect.objectContaining({ method: 'PATCH' }));
  });

  it('cambiarEstadoCliente usa PATCH /api/clientes/:id/estado', async () => {
    const fn = mockFetch();
    await cambiarEstadoCliente('abc', false, '2026-11-02T00:00:00.000Z');
    expect(fn).toHaveBeenCalledWith('/api/clientes/abc/estado', expect.objectContaining({ method: 'PATCH' }));
  });

  it('obtenerClientes traduce el filtro de estado a ?activo=', async () => {
    const fn = mockFetch();
    await obtenerClientes({ estado: 'inactivos', pagina: 2, q: ' acme ' });
    expect(fn.mock.calls[0][0]).toBe('/api/clientes?q=acme&activo=false&pagina=2');
  });
});

describe('mensajeDeError', () => {
  it('usa el mensaje de la API y nunca muestra "undefined"', () => {
    expect(mensajeDeError(new ErrorApi(409, 'Ya existe un registro con ese valor único'))).toBe(
      'Ya existe un registro con ese valor único',
    );
  });

  it('agrega el primer detalle de Zod con su campo', () => {
    const err = new ErrorApi(400, 'Datos inválidos', [{ path: ['email'], message: 'Invalid email' }]);
    expect(mensajeDeError(err)).toBe('Datos inválidos (email: Invalid email)');
  });

  it('cae al texto por defecto si no hay nada útil', () => {
    expect(mensajeDeError({}, 'Error al guardar')).toBe('Error al guardar');
  });
});
