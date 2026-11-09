import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  almacenMemoria, usarAlmacenFotos, fijarUsuarioFotos, guardarFoto, sincronizarFotos, fotosDelUsuario, reintentarFoto, type AlmacenFotos,
} from './fotos-pendientes.js';

const fetchOriginal = globalThis.fetch;
const json = (body: unknown, status = 200) => ({ ok: status < 400, status, statusText: '', headers: new Headers({ 'content-type': 'application/json' }), json: async () => body });
const sinRed = () => Promise.reject(new TypeError('Failed to fetch'));
const blob = () => new Blob([new Uint8Array(5)], { type: 'image/jpeg' });
let almacen: AlmacenFotos;

/** Simula la API + Storage: cada foto = solicitar (201) → PUT → confirmar. `rechazo` decide por cuerpo. */
function servidor(rechazo?: (body: Record<string, unknown>) => { status: number; error: string } | null) {
  const pedidos: Record<string, unknown>[] = [];
  globalThis.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
    if (url.endsWith('/solicitar')) {
      const body = JSON.parse(String(init.body));
      pedidos.push(body);
      const r = rechazo?.(body);
      if (r) return json({ error: r.error }, r.status);
      return json({ id: body.claveIdempotencia, estado: 'PENDIENTE', subirA: '/subir' }, 201);
    }
    return json({ ok: true });
  });
  return pedidos;
}

beforeEach(async () => {
  almacen = almacenMemoria();
  usarAlmacenFotos(almacen);
  fijarUsuarioFotos(null); // que guardar no dispare la subida antes de tiempo
});
afterEach(() => {
  globalThis.fetch = fetchOriginal;
});
const guardar = (etiqueta: string, ref: Record<string, string>, tipo = 'EVIDENCIA_PARADA' as const) =>
  guardarFoto({ etiqueta, tipo, ref, mime: 'image/jpeg', blob: blob() });

describe('fotos guardadas en el celular', () => {
  it('sin señal quedan guardadas; al volver suben en orden, con su id como clave (no duplica)', async () => {
    fijarUsuarioFotos('edu');
    globalThis.fetch = vi.fn().mockImplementation(sinRed);
    await guardar('Foto 1', { paradaId: 'p1' });
    await guardar('Foto 2', { paradaId: 'p1' });
    await sincronizarFotos();
    expect(await fotosDelUsuario()).toHaveLength(2);
    const pedidos = servidor();
    expect(await sincronizarFotos()).toBe(2);
    expect(await fotosDelUsuario()).toHaveLength(0);
    const guardadas = pedidos.map((p) => p.claveIdempotencia);
    expect(new Set(guardadas).size).toBe(2);
    // Recién sacadas: no se manda la hora (no es "sin señal").
    expect(pedidos[0].tomadaAt).toBeUndefined();
  });

  it('una foto vieja manda su hora real (la API la marca "sin señal")', async () => {
    await almacen.poner({ id: crypto.randomUUID(), usuario: 'edu', etiqueta: 'Vieja', tipo: 'EVIDENCIA_PARADA', ref: { paradaId: 'p1' }, mime: 'image/jpeg', blob: blob(), tomada_at: new Date(Date.now() - 3600_000).toISOString() });
    const pedidos = servidor();
    fijarUsuarioFotos('edu');
    await sincronizarFotos();
    expect(pedidos[0].tomadaAt).toMatch(/T/);
  });

  it('el odómetro de un viaje que todavía no llegó espera; las demás siguen; un rechazo queda a la vista', async () => {
    fijarUsuarioFotos('edu');
    globalThis.fetch = vi.fn().mockImplementation(sinRed);
    await guardar('Odómetro', { claveViaje: 'v1' }, 'ODOMETRO_INICIO' as never);
    await guardar('Montaje', { paradaId: 'p1' });
    await guardar('Ajena', { paradaId: 'p9' });
    await sincronizarFotos();
    servidor((b) => (b.claveViaje ? { status: 404, error: 'El viaje todavía no llegó al servidor' } : b.paradaId === 'p9' ? { status: 403, error: 'No estás en la cuadrilla' } : null));
    expect(await sincronizarFotos()).toBe(1);
    const quedan = await fotosDelUsuario();
    expect(quedan.map((f) => [f.etiqueta, f.error ?? null])).toEqual([['Odómetro', null], ['Ajena', 'No estás en la cuadrilla']]);
    // Llegó el viaje: el odómetro sube; la rechazada no se reintenta sola.
    servidor();
    expect(await sincronizarFotos()).toBe(1);
    expect((await fotosDelUsuario()).map((f) => f.etiqueta)).toEqual(['Ajena']);
    await reintentarFoto(quedan[1].id);
    await sincronizarFotos();
    expect(await fotosDelUsuario()).toHaveLength(0);
  });

  it('celular compartido: cada uno sube lo suyo; un 401 frena sin perder nada', async () => {
    fijarUsuarioFotos('edu');
    globalThis.fetch = vi.fn().mockImplementation(sinRed);
    await guardar('De Edu', { paradaId: 'p1' });
    globalThis.fetch = vi.fn().mockResolvedValue(json({ error: 'Sesión inválida' }, 401));
    fijarUsuarioFotos('nachi');
    await sincronizarFotos();
    expect(await fotosDelUsuario()).toHaveLength(0); // nachi no ve ni sube la de Edu
    fijarUsuarioFotos('edu');
    await sincronizarFotos();
    expect((await fotosDelUsuario())[0].error).toBeUndefined();
  });

  it('una foto sacada mientras otra sube no queda esperando al próximo intento', async () => {
    fijarUsuarioFotos('edu');
    servidor();
    const primera = guardar('Primera', { paradaId: 'p1' });
    await guardar('Segunda', { paradaId: 'p1' }); // llega con la corrida de la primera en marcha
    await primera;
    // Sin volver a llamar a sincronizar: la corrida en marcha se repite sola y sube la segunda.
    await vi.waitFor(async () => expect(await fotosDelUsuario()).toHaveLength(0));
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => String(c[0]).endsWith('/solicitar'))).toHaveLength(2);
  });
});
