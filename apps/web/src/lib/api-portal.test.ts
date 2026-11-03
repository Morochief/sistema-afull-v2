import { describe, it, expect, vi, afterEach } from 'vitest';
import * as p from './api-portal.js';

const fetchOriginal = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchOriginal;
  window.history.replaceState(null, '', '/');
  sessionStorage.clear();
});
const respuesta = (status = 200, body: unknown = {}) => ({ ok: status < 400, status, headers: new Headers({ 'content-type': 'application/json' }), json: async () => body });

describe('portal: token del enlace', () => {
  it('lo toma del fragmento, lo guarda en la pestaña y lo borra de la barra', () => {
    const t = 'A'.repeat(43);
    window.history.replaceState(null, '', `/portal#t=${t}`);
    expect(p.tomarTokenDelEnlace()).toBe(t);
    expect(window.location.hash).toBe('');
    expect(p.tomarTokenDelEnlace()).toBe(t);
  });
  it('sin fragmento ni nada guardado → null', () => {
    expect(p.tomarTokenDelEnlace()).toBeNull();
  });
});

describe('portal: llamadas con el token en el header y sin cookies', () => {
  it('manda Authorization: Portal y credentials omit; un 401 no redirige, tira el error', async () => {
    const fn = vi.fn().mockResolvedValue(respuesta(401, { error: 'Enlace inválido o vencido' }));
    globalThis.fetch = fn;
    await expect(p.portalYo('tok')).rejects.toMatchObject({ status: 401 });
    const [u, init] = fn.mock.calls[0] as [string, RequestInit];
    expect(u).toBe('/api/portal/yo');
    expect(init.credentials).toBe('omit');
    expect((init.headers as Record<string, string>).authorization).toBe('Portal tok');
  });
  it.each([
    ['pedidos pág. 2', () => p.portalPedidos('t', 2), '/api/portal/pedidos?pagina=2', 'GET'],
    ['ots', () => p.portalOTs('t'), '/api/portal/ots', 'GET'],
    ['nuevo pedido', () => p.portalNuevoPedido('t', { descripcion: 'Lona nueva', claveIdempotencia: 'k' }), '/api/portal/pedidos', 'POST'],
  ] as [string, () => Promise<unknown>, string, string][])('%s', async (_n, llamar, url, metodo) => {
    const fn = vi.fn().mockResolvedValue(respuesta());
    globalThis.fetch = fn;
    await llamar();
    const [u, init] = fn.mock.calls[0] as [string, RequestInit];
    expect([u, init.method]).toEqual([url, metodo]);
  });
});

describe('Comercial: rutas de enlaces y pedidos', () => {
  it.each([
    ['accesos', () => p.accesosDeCliente('c1'), '/api/portal-accesos/cliente/c1', 'GET'],
    ['crear acceso', () => p.crearAccesoPortal({ clienteId: 'c1', descripcion: 'Compras' }), '/api/portal-accesos', 'POST'],
    ['revocar', () => p.revocarAccesoPortal('a1'), '/api/portal-accesos/a1/revocar', 'POST'],
    ['pedidos', () => p.listarPedidos({ estado: 'NUEVO', pagina: 1 }), '/api/pedidos?estado=NUEVO', 'GET'],
    ['convertir', () => p.convertirPedido('x', 'OT'), '/api/pedidos/x/convertir', 'POST'],
    ['descartar', () => p.descartarPedido('x', 'dup'), '/api/pedidos/x/descartar', 'POST'],
  ] as [string, () => Promise<unknown>, string, string][])('%s', async (_n, llamar, url, metodo) => {
    const fn = vi.fn().mockResolvedValue(respuesta());
    globalThis.fetch = fn;
    await llamar();
    const [u, init] = fn.mock.calls[0] as [string, RequestInit | undefined];
    expect([u, init?.method ?? 'GET']).toEqual([url, metodo]);
  });
  it('el enlace lleva el token en el fragmento, no en la ruta', () => {
    expect(p.enlacePortal('abc')).toBe(`${window.location.origin}/portal#t=abc`);
  });
});
