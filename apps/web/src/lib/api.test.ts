import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch, ErrorApi } from './api.js';

describe('apiFetch', () => {
  const fetchOriginal = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
  });

  it('devuelve el JSON de la respuesta en peticiones exitosas (200 OK)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ ok: true, datos: { id: '123' } }),
    });

    const resultado = await apiFetch<{ ok: boolean; datos: { id: string } }>('/api/prueba');
    expect(resultado.ok).toBe(true);
    expect(resultado.datos.id).toBe('123');
  });

  it('interpola parámetros de consulta (query params) en la URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ total: 1 }),
    });
    globalThis.fetch = fetchMock;

    await apiFetch('/api/clientes', {
      params: { q: 'cartel', activo: true, pagina: 2, vacio: null, sinDefinir: undefined },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/clientes?q=cartel&activo=true&pagina=2',
      expect.objectContaining({ credentials: 'same-origin' })
    );
  });

  it('mapea error 401 a ErrorApi con status 401', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ error: 'Sesión expirada o no autenticado' }),
    });

    await expect(apiFetch('/api/protegido')).rejects.toThrow(ErrorApi);
    try {
      await apiFetch('/api/protegido');
    } catch (err) {
      const apiErr = err as ErrorApi;
      expect(apiErr.status).toBe(401);
      expect(apiErr.mensaje).toContain('no autenticado');
    }
  });

  it('mapea error 403 a ErrorApi con status 403', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ error: 'Permiso denegado' }),
    });

    try {
      await apiFetch('/api/admin-only');
    } catch (err) {
      const apiErr = err as ErrorApi;
      expect(apiErr.status).toBe(403);
      expect(apiErr.mensaje).toContain('Permiso denegado');
    }
  });

  it('mapea error 409 a ErrorApi con status 409 (conflicto de concurrencia)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ error: 'El registro fue modificado por otro usuario' }),
    });

    try {
      await apiFetch('/api/cliente/1', { method: 'PATCH', body: '{}' });
    } catch (err) {
      const apiErr = err as ErrorApi;
      expect(apiErr.status).toBe(409);
      expect(apiErr.mensaje).toContain('modificado por otro usuario');
    }
  });

  it('mapea error 400 con detalle Zod', async () => {
    const issues = [{ path: ['email'], message: 'Email inválido' }];
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ error: 'Datos inválidos', detalle: issues }),
    });

    try {
      await apiFetch('/api/cliente', { method: 'POST', body: '{}' });
    } catch (err) {
      const apiErr = err as ErrorApi;
      expect(apiErr.status).toBe(400);
      expect(apiErr.mensaje).toBe('Datos inválidos');
      expect(apiErr.detalle).toEqual(issues);
    }
  });

  it('mapea error de red (fetch rechaza) a ErrorApi con status 0', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));

    try {
      await apiFetch('/api/test');
    } catch (err) {
      const apiErr = err as ErrorApi;
      expect(apiErr.status).toBe(0);
      expect(apiErr.mensaje).toContain('No se pudo conectar con el servidor');
    }
  });
});
