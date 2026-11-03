import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { enviarOEncolar, sincronizar, pendientes, rechazadas, descartarRechazada, fijarUsuarioCola } from './cola-offline.js';

const fetchOriginal = globalThis.fetch;
const ok = (body: unknown = {}) => ({ ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => body });
const err = (status: number, error: string) => ({ ok: false, status, statusText: '', headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ error }) });
const sinRed = () => Promise.reject(new TypeError('Failed to fetch'));

beforeEach(() => {
  localStorage.clear();
  fijarUsuarioCola('edu');
});
afterEach(() => {
  globalThis.fetch = fetchOriginal;
  localStorage.clear();
});

describe('cola sin conexión', () => {
  it('con señal manda directo y no encola', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(ok({ id: 'v1' }));
    const r = await enviarOEncolar('Iniciar viaje', '/api/campo/viajes/iniciar', { kmInicio: 10 });
    expect(r).toEqual({ encolada: false, respuesta: { id: 'v1' } });
    expect(pendientes()).toHaveLength(0);
  });

  it('sin señal encola con la hora real (solo campo y asistencia); un 4xx NO se encola', async () => {
    globalThis.fetch = vi.fn().mockImplementation(sinRed);
    expect((await enviarOEncolar('Marcar entrada', '/api/asistencia/marcar', { tipo: 'ENTRADA' })).encolada).toBe(true);
    expect((await enviarOEncolar('Material', '/api/consumos', { cantidad: 1 })).encolada).toBe(true);
    const [a, b] = pendientes();
    expect((a.body as { ocurridaAt: string }).ocurridaAt).toBe(a.creada_at);
    expect(b.body).toEqual({ cantidad: 1 });
    globalThis.fetch = vi.fn().mockResolvedValue(err(400, 'Datos inválidos'));
    localStorage.clear();
    await expect(enviarOEncolar('X', '/api/campo/paradas/p/completar')).rejects.toMatchObject({ status: 400 });
    expect(pendientes()).toHaveLength(0);
  });

  it('con algo pendiente, lo nuevo va detrás aunque haya señal (el orden importa)', async () => {
    globalThis.fetch = vi.fn().mockImplementation(sinRed);
    await enviarOEncolar('Iniciar viaje', '/api/campo/viajes/iniciar', {});
    const f = vi.fn().mockResolvedValue(ok());
    globalThis.fetch = f;
    expect((await enviarOEncolar('Parada', '/api/campo/paradas/p/completar')).encolada).toBe(true);
    expect(f).not.toHaveBeenCalled();
    expect(pendientes().map((p) => p.etiqueta)).toEqual(['Iniciar viaje', 'Parada']);
  });

  it('sincronizar: manda en orden; un rechazo pasa a "rechazadas" y sigue; sin señal o 401 se frena', async () => {
    globalThis.fetch = vi.fn().mockImplementation(sinRed);
    for (const e of ['A', 'B', 'C', 'D']) await enviarOEncolar(e, `/api/campo/x/${e}`, {});
    const llamadas: string[] = [];
    globalThis.fetch = vi.fn().mockImplementation(async (u: string) => {
      llamadas.push(u);
      if (u.endsWith('/B')) return err(409, 'La parada ya está OMITIDA');
      if (u.endsWith('/D')) return sinRed();
      return ok();
    });
    expect(await sincronizar()).toBe(3);
    expect(llamadas).toEqual(['/api/campo/x/A', '/api/campo/x/B', '/api/campo/x/C', '/api/campo/x/D']);
    expect(pendientes().map((p) => p.etiqueta)).toEqual(['D']);
    expect(rechazadas().map((r) => [r.etiqueta, r.error])).toEqual([['B', 'La parada ya está OMITIDA']]);
    descartarRechazada(rechazadas()[0].id);
    expect(rechazadas()).toHaveLength(0);
  });
});

describe('cola sin conexión: regresión', () => {
  it('una corrida con la cola vacía no deja la sincronización trabada', async () => {
    expect(await sincronizar()).toBe(0);
    globalThis.fetch = vi.fn().mockImplementation(sinRed);
    await enviarOEncolar('Marcar entrada', '/api/asistencia/marcar', {});
    globalThis.fetch = vi.fn().mockResolvedValue(ok());
    expect(await sincronizar()).toBe(1);
    expect(pendientes()).toHaveLength(0);
  });
});

describe('cola sin conexión: celular compartido', () => {
  it('solo manda lo de quien está en sesión; lo ajeno espera a que vuelva su dueño', async () => {
    globalThis.fetch = vi.fn().mockImplementation(sinRed);
    await enviarOEncolar('Entrada de Edu', '/api/asistencia/marcar', {});
    fijarUsuarioCola('juan');
    const f = vi.fn().mockResolvedValue(ok());
    globalThis.fetch = f;
    expect(await sincronizar()).toBe(0);
    expect(f).not.toHaveBeenCalled();
    fijarUsuarioCola(null);
    expect(await sincronizar()).toBe(0);
    fijarUsuarioCola('edu');
    await new Promise((r) => setTimeout(r, 0));
    await sincronizar();
    expect(pendientes()).toHaveLength(0);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
