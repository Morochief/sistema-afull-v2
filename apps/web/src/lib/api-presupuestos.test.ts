import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  obtenerPresupuestos,
  obtenerPresupuesto,
  crearPresupuesto,
  editarPresupuesto,
  agregarItemPresupuesto,
  editarItemPresupuesto,
  accionPresupuesto,
  obtenerProyectos,
  finalizarProyecto,
  asociarProyectoOT,
} from './api-presupuestos.js';

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

const llamada = (fn: ReturnType<typeof vi.fn>) => {
  const [url, init] = fn.mock.calls[0] as [string, RequestInit | undefined];
  return { url, metodo: init?.method ?? 'GET', cuerpo: init?.body ? JSON.parse(String(init.body)) : undefined };
};

describe('api-presupuestos: métodos y rutas alineados con Hono', () => {
  it('listados: GET con query sin vacíos ni "todos"', async () => {
    let fn = mockFetch();
    await obtenerPresupuestos({ q: ' ferre ', estado: 'todos', pagina: 1 });
    expect(llamada(fn)).toMatchObject({ url: '/api/presupuestos?q=ferre', metodo: 'GET' });
    fn = mockFetch();
    await obtenerProyectos({ estado: 'ABIERTO', pagina: 3 });
    expect(llamada(fn)).toMatchObject({ url: '/api/proyectos?estado=ABIERTO&pagina=3', metodo: 'GET' });
  });

  it('detalle, alta y edición', async () => {
    let fn = mockFetch();
    await obtenerPresupuesto('p1');
    expect(llamada(fn)).toMatchObject({ url: '/api/presupuestos/p1', metodo: 'GET' });
    fn = mockFetch();
    await crearPresupuesto({ clienteId: 'c1', titulo: 't' });
    expect(llamada(fn)).toMatchObject({ url: '/api/presupuestos', metodo: 'POST' });
    fn = mockFetch();
    await editarPresupuesto('p1', { titulo: 'x', updatedAt: '2026-11-03T00:00:00Z' });
    expect(llamada(fn)).toMatchObject({ url: '/api/presupuestos/p1', metodo: 'PATCH' });
  });

  it('ítems: POST para agregar y PATCH para editar', async () => {
    let fn = mockFetch();
    await agregarItemPresupuesto('p1', { descripcion: 'Lona' });
    expect(llamada(fn)).toMatchObject({ url: '/api/presupuestos/p1/items', metodo: 'POST' });
    fn = mockFetch();
    await editarItemPresupuesto('p1', 'i1', { activo: false });
    expect(llamada(fn)).toMatchObject({ url: '/api/presupuestos/p1/items/i1', metodo: 'PATCH', cuerpo: { activo: false } });
  });

  it('acciones de estado mandan desde y comentario', async () => {
    const fn = mockFetch();
    await accionPresupuesto('p1', 'aprobar', 'ENVIADO', 'OC 12');
    expect(llamada(fn)).toMatchObject({
      url: '/api/presupuestos/p1/aprobar',
      metodo: 'POST',
      cuerpo: { desde: 'ENVIADO', comentario: 'OC 12' },
    });
  });

  it('proyectos y vínculo con OT', async () => {
    let fn = mockFetch();
    await finalizarProyecto('py1', 'cancelar', 'motivo');
    expect(llamada(fn)).toMatchObject({ url: '/api/proyectos/py1/cancelar', metodo: 'POST' });
    fn = mockFetch();
    await asociarProyectoOT('ot1', null, '2026-11-03T00:00:00Z');
    expect(llamada(fn)).toMatchObject({ url: '/api/comercial/ot/ot1/proyecto', metodo: 'POST', cuerpo: { proyectoId: null } });
  });
});
