import { describe, it, expect, vi, afterEach } from 'vitest';
import { subirArchivo, llamadorSesion, BASE_SESION, listarArchivos } from './api-archivos.js';

const fetchOriginal = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchOriginal;
});
const json = (body: unknown, status = 200) => ({ ok: status < 400, status, statusText: '', headers: new Headers({ 'content-type': 'application/json' }), json: async () => body });
const blob = new Blob([new Uint8Array(10)], { type: 'image/jpeg' });
const datos = { tipo: 'EVIDENCIA_PARADA' as const, paradaId: 'p1', mime: 'image/jpeg', blob, claveIdempotencia: 'c1' };

describe('subirArchivo', () => {
  it('pide (con el tamaño real), sube con PUT directo a la URL firmada sin cookies, y confirma', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(json({ id: 'a1', estado: 'PENDIENTE', subirA: 'https://ref.supabase.co/storage/v1/object/upload/sign/b/x.jpg?token=t' }, 201))
      .mockResolvedValueOnce(json({ Key: 'x' }))
      .mockResolvedValueOnce(json({ id: 'a1', estado: 'SUBIDO' }));
    globalThis.fetch = f;
    expect(await subirArchivo(llamadorSesion, BASE_SESION, datos)).toBe('a1');
    expect(f.mock.calls[0][0]).toBe('/api/archivos/solicitar');
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ tipo: 'EVIDENCIA_PARADA', paradaId: 'p1', mime: 'image/jpeg', claveIdempotencia: 'c1', bytes: 10 });
    const [url, put] = f.mock.calls[1];
    expect(url).toContain('token=t');
    expect(put).toMatchObject({ method: 'PUT', credentials: 'omit', body: blob });
    expect(put.headers).toMatchObject({ 'content-type': 'image/jpeg', 'x-upsert': 'true' });
    expect(f.mock.calls[2][0]).toBe('/api/archivos/a1/confirmar');
    expect(f.mock.calls[2][1].method).toBe('POST');
  });

  it('si ya estaba subido (reintento), no vuelve a subir', async () => {
    const f = vi.fn().mockResolvedValueOnce(json({ id: 'a1', estado: 'SUBIDO' }, 201));
    globalThis.fetch = f;
    expect(await subirArchivo(llamadorSesion, BASE_SESION, datos)).toBe('a1');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('corte al subir o Storage caído → status 0 (se reintenta); 413 → 400 (no se reintenta)', async () => {
    const pedir = () => json({ id: 'a1', estado: 'PENDIENTE', subirA: '/x' }, 201);
    globalThis.fetch = vi.fn().mockResolvedValueOnce(pedir()).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(subirArchivo(llamadorSesion, BASE_SESION, datos)).rejects.toMatchObject({ status: 0 });
    globalThis.fetch = vi.fn().mockResolvedValueOnce(pedir()).mockResolvedValueOnce(json({}, 502));
    await expect(subirArchivo(llamadorSesion, BASE_SESION, datos)).rejects.toMatchObject({ status: 0 });
    globalThis.fetch = vi.fn().mockResolvedValueOnce(pedir()).mockResolvedValueOnce(json({}, 413));
    await expect(subirArchivo(llamadorSesion, BASE_SESION, datos)).rejects.toMatchObject({ status: 400 });
  });

  it('listar arma la consulta con la referencia', async () => {
    const f = vi.fn().mockResolvedValue(json([]));
    globalThis.fetch = f;
    await listarArchivos(llamadorSesion, BASE_SESION, { tareaId: 't1', paradaId: undefined });
    expect(f.mock.calls[0][0]).toBe('/api/archivos?tareaId=t1');
  });
});
