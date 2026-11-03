import { describe, it, expect, vi, afterEach } from 'vitest';
import * as p from './api-permisos.js';
import { periodo } from '../components/permisos/etiquetas.js';

const fetchOriginal = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

describe('api-permisos: rutas alineadas con Hono', () => {
  it.each([
    ['listar', () => p.listarPermisos({ estado: 'PENDIENTE', pagina: 1 }), '/api/permisos?estado=PENDIENTE', 'GET'],
    ['detalle', () => p.obtenerPermiso('s1'), '/api/permisos/s1', 'GET'],
    ['crear', () => p.crearPermiso({ tipo: 'ESTUDIO', motivo: 'Examen final', modalidad: 'DIAS', fechaDesde: '2026-11-05', fechaHasta: '2026-11-05', claveIdempotencia: 'k' }), '/api/permisos', 'POST'],
    ['transicionar', () => p.transicionarPermiso('s1', { desde: 'PENDIENTE', a: 'AUTORIZADA' }), '/api/permisos/s1/transicionar', 'POST'],
    ['asistencia fuera', () => p.listarAsistencia({ q: 'edu', estado: 'FUERA', pagina: 1 }), '/api/asistencia?q=edu&soloFuera=true', 'GET'],
    ['asistencia todas', () => p.listarAsistencia({ estado: 'todos', pagina: 1 }), '/api/asistencia', 'GET'],
  ] as [string, () => Promise<unknown>, string, string][])('%s', async (_n, llamar, url, metodo) => {
    const fn = vi.fn().mockResolvedValue({ ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({}) });
    globalThis.fetch = fn;
    await llamar();
    const [u, init] = fn.mock.calls[0] as [string, RequestInit | undefined];
    expect(u).toBe(url);
    expect(init?.method ?? 'GET').toBe(metodo);
  });

  it('periodo: por horas y por días', () => {
    expect(periodo({ modalidad: 'HORAS', fecha_desde: '2026-11-05', fecha_hasta: '2026-11-05', hora_desde: '15:00', hora_hasta: '17:00' })).toBe('05/11/2026 de 15:00 a 17:00');
    expect(periodo({ modalidad: 'DIAS', fecha_desde: '2026-11-05', fecha_hasta: '2026-11-07', hora_desde: null, hora_hasta: null })).toBe('05/11/2026 al 07/11/2026');
  });
});
