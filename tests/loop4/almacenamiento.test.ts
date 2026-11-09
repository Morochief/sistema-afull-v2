import { describe, it, expect, vi, afterEach } from 'vitest';
import { supabaseStorage } from '../../apps/api/src/lib/almacenamiento.js';

/** El cliente REST de Supabase Storage (sin SDK): rutas, headers y manejo de errores, con fetch simulado. */
type Llamada = { url: string; init: RequestInit };
function simular(respuestas: Response[]) {
  const llamadas: Llamada[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    llamadas.push({ url, init });
    return respuestas.shift()!;
  });
  return llamadas;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const headers = (l: Llamada) => l.init.headers as Record<string, string>;
afterEach(() => vi.unstubAllGlobals());

const BASE = 'https://ref.supabase.co/';
const RUTA = 'odometro_inicio/2026-11/0b6d3f0e-6f4c-4a54-9a9e-2f8f0d1d2c3b.jpg';

describe('Almacenamiento — Supabase Storage por REST', () => {
  it('firma la subida con upsert y arma la URL absoluta; clave nueva solo en apikey', async () => {
    const ll = simular([json({ url: `/object/upload/sign/afull-archivos/${RUTA}?token=abc` })]);
    const s = supabaseStorage(BASE, 'sb_secret_xyz', 'afull-archivos');
    const url = await s.firmarSubida(RUTA);
    expect(url).toBe(`https://ref.supabase.co/storage/v1/object/upload/sign/afull-archivos/${RUTA}?token=abc`);
    expect(ll[0].url).toBe(`https://ref.supabase.co/storage/v1/object/upload/sign/afull-archivos/${RUTA}`);
    expect(ll[0].init.method).toBe('POST');
    expect(headers(ll[0])).toMatchObject({ apikey: 'sb_secret_xyz', 'x-upsert': 'true' });
    expect(headers(ll[0]).Authorization).toBeUndefined();
  });

  it('la service_role vieja (JWT) va también como Bearer', async () => {
    const ll = simular([json({ signedURL: `/object/sign/afull-archivos/${RUTA}?token=t` })]);
    const url = await supabaseStorage(BASE, 'eyJhbGciOi.x.y', 'afull-archivos').firmarDescarga(RUTA, 600);
    expect(url).toBe(`https://ref.supabase.co/storage/v1/object/sign/afull-archivos/${RUTA}?token=t`);
    expect(headers(ll[0]).Authorization).toBe('Bearer eyJhbGciOi.x.y');
    expect(JSON.parse(String(ll[0].init.body))).toEqual({ expiresIn: 600 });
  });

  it('info: tamaño y tipo del objeto; null si no existe (404 o 400 de Storage)', async () => {
    simular([json({ size: 321, content_type: 'image/jpeg' }), json({ statusCode: '404', error: 'not_found' }, 400), json({}, 404)]);
    const s = supabaseStorage(BASE, 'sb_secret_xyz', 'afull-archivos');
    expect(await s.info(RUTA)).toEqual({ bytes: 321, mime: 'image/jpeg' });
    expect(await s.info(RUTA)).toBeNull();
    expect(await s.info(RUTA)).toBeNull();
  });

  it('un error de Storage es 503 y el log no lleva la clave', async () => {
    simular([new Response('boom', { status: 500 })]);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(supabaseStorage(BASE, 'sb_secret_xyz', 'afull-archivos').firmarSubida(RUTA)).rejects.toMatchObject({ status: 503 });
    expect(JSON.stringify(err.mock.calls)).not.toContain('sb_secret_xyz');
    err.mockRestore();
  });
});
