import { describe, it, expect, afterAll } from 'vitest';
import { admin, cerrarConexiones } from '../loop0/helpers.js';
import { sesion } from './helpers-comercial.js';

afterAll(cerrarConexiones);

describe('0012 — catálogo de procesos y cronómetro para Comercial', () => {
  it('admin agrega un proceso, no se duplica, y desactivado ya no se puede asignar', async () => {
    const juan = await sesion(['admin']);
    const nombre = 'Zz test laminado ' + crypto.randomUUID().slice(0, 6);
    const p = await juan('POST', '/api/procesos', { nombre, area: 'TALLER' });
    expect(p.status).toBe(201);
    const codigo = String(p.j.codigo);
    expect(codigo).toMatch(/^ZZ_TEST_LAMINADO_/);
    expect((await juan('POST', '/api/procesos', { nombre: nombre.toUpperCase(), area: 'TALLER' })).status).toBe(409);
    const [c] = await admin`INSERT INTO cliente (codigo, nombre) VALUES (${'ZP' + codigo.slice(-6)}, 'zz_test_cli_proc') RETURNING id`;
    const ot = (await juan('POST', '/api/comercial/ot', { clienteId: c.id, titulo: 'zz_test', tareas: [{ tipo: codigo, descripcion: 'laminar' }] }));
    expect(ot.status).toBe(201);
    expect((await juan('PATCH', `/api/procesos/${codigo}`, { activo: false })).status).toBe(200);
    expect((await juan('POST', `/api/comercial/ot/${ot.j.id}/tareas`, { tipo: codigo, descripcion: 'otra' })).status).toBe(400);
    expect((await juan('POST', `/api/comercial/ot/${ot.j.id}/tareas`, { tipo: 'NO_EXISTE', descripcion: 'x' })).status).toBe(400);
  });

  it('cualquiera con sesión lee el catálogo; solo admin lo modifica; comercial usa "Mi trabajo"', async () => {
    const sofi = await sesion(['comercial']);
    const lista = (await sofi('GET', '/api/procesos')).j as unknown as { codigo: string }[];
    expect(lista.map((x) => x.codigo)).toEqual(expect.arrayContaining(['PLOTEO', 'PRESUPUESTO', 'MONTAJE_CALLE', 'DISENO']));
    expect((await sofi('POST', '/api/procesos', { nombre: 'zz no', area: 'OTRO' })).status).toBe(403);
    const r = await sofi('GET', '/api/mi-trabajo');
    expect(String(r.j.error ?? '')).not.toMatch(/requiere capacidad/);
  });
});
