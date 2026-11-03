import { describe, it, expect, afterAll } from 'vitest';
import { admin, api as apiDb, cerrarConexiones } from '../loop0/helpers.js';
import { sesion } from '../loop3/helpers-comercial.js';

afterAll(cerrarConexiones);
const uuid = () => crypto.randomUUID();

async function escenario() {
  const tag = uuid().slice(0, 8);
  const juan = await sesion(['admin']);
  const edu = await sesion(['taller']);
  const op = await sesion(['montaje']);
  const lona = (await juan('POST', '/api/insumos', { nombre: 'zz_test Lona front ' + tag, unidad: 'M2', sector: 'Impresiones', costoUnitarioGs: 63000 })).j;
  const desp = (await juan('POST', '/api/insumos', { nombre: 'zz_test Lona desperdicio ' + tag, unidad: 'M2', costoUnitarioGs: 15500 })).j;
  const [c] = await admin`INSERT INTO cliente (codigo, nombre) VALUES (${'ZI' + tag}, ${'zz_test_cli_ins_' + tag}) RETURNING id`;
  const ot1 = (await juan('POST', '/api/comercial/ot', { clienteId: c.id, titulo: 'zz_test OT1', tareas: [{ tipo: 'PLOTEO', descripcion: 'ploteo' }] })).j;
  const ot2 = (await juan('POST', '/api/comercial/ot', { clienteId: c.id, titulo: 'zz_test OT2' })).j;
  return { juan, edu, op, lona: lona.id as string, desp: desp.id as string, ot1: ot1.id as string, ot2: ot2.id as string, tag };
}

describe('Loop 5 — insumos y consumos (sin stock)', () => {
  it('el operario carga lo usado con el costo vigente congelado; un precio nuevo no cambia lo ya cargado', async () => {
    const e = await escenario();
    const clave = uuid();
    const a = await e.op('POST', '/api/consumos', { otId: e.ot1, insumoId: e.lona, cantidad: 2.5, claveIdempotencia: clave });
    expect(a.status).toBe(201);
    expect((await e.op('POST', '/api/consumos', { otId: e.ot1, insumoId: e.lona, cantidad: 2.5, claveIdempotencia: clave })).status).toBe(200);
    expect((await e.juan('POST', `/api/insumos/${e.lona}/precios`, { costoUnitarioGs: 70000 })).status).toBe(201);
    const r = (await e.op('GET', `/api/consumos/ot/${e.ot1}`)).j as { items: { costo_unitario_gs: number }[]; total_gs: number };
    expect(r.items).toHaveLength(1);
    expect(r.items[0].costo_unitario_gs).toBe(63000);
    expect(r.total_gs).toBe(157500);
  });

  it('merma de Edu: piezas y desperdicio (con su propio precio) en el mismo grupo', async () => {
    const e = await escenario();
    const m = await e.edu('POST', '/api/consumos/merma', {
      otId: e.ot1, insumoId: e.lona, insumoDesperdicioId: e.desp, anchoMaterialM: 1.52, largoUsadoM: 1.6,
      piezas: [{ anchoM: 1, altoM: 0.5, cantidad: 3 }], claveIdempotencia: uuid(),
    });
    expect(m.status).toBe(201);
    expect(m.j.aprovechamientoPct).toBe(61.7);
    const r = (await e.edu('GET', `/api/consumos/ot/${e.ot1}`)).j as { total_gs: number; desperdicio_gs: number };
    expect(r.total_gs).toBe(Math.round(1.5 * 63000) + Math.round(0.932 * 15500));
    expect(r.desperdicio_gs).toBe(Math.round(0.932 * 15500));
  });

  it('plancha compartida entre 2 OTs: reparto proporcional y Σ exacta', async () => {
    const e = await escenario();
    const r = await e.edu('POST', '/api/consumos/compartido', {
      insumoId: e.lona, cantidadTotal: 2, repartos: [{ otId: e.ot1, m2Piezas: 0.9 }, { otId: e.ot2, m2Piezas: 0.3 }], claveIdempotencia: uuid(),
    });
    expect(r.status).toBe(201);
    expect(r.j.partes).toEqual([1.5, 0.5]);
  });

  it('corregir = negativo con motivo, una sola vez; la tabla es inmutable', async () => {
    const e = await escenario();
    const a = (await e.op('POST', '/api/consumos', { otId: e.ot1, insumoId: e.lona, cantidad: 1, claveIdempotencia: uuid() })).j as { ids: string[] };
    const id = a.ids[0];
    expect((await e.edu('POST', `/api/consumos/${id}/anular`, { motivo: 'no fue mío', claveIdempotencia: uuid() })).status).toBe(403);
    expect((await e.op('POST', `/api/consumos/${id}/anular`, { motivo: 'cargué de más', claveIdempotencia: uuid() })).status).toBe(201);
    expect((await e.op('POST', `/api/consumos/${id}/anular`, { motivo: 'otra vez', claveIdempotencia: uuid() })).status).toBe(409);
    const r = (await e.op('GET', `/api/consumos/ot/${e.ot1}`)).j as { total_gs: number };
    expect(r.total_gs).toBe(0);
    await expect(apiDb`UPDATE consumo_insumo SET cantidad = 5 WHERE id = ${id}`).rejects.toBeTruthy();
    await expect(apiDb`DELETE FROM consumo_insumo WHERE id = ${id}`).rejects.toBeTruthy();
  });

  it('reglas: OT terminada no recibe material; tarea de otra OT → 400; solo admin edita el catálogo', async () => {
    const e = await escenario();
    const [t] = await admin`SELECT id FROM tarea WHERE orden_trabajo_id = ${e.ot1}`;
    expect((await e.op('POST', '/api/consumos', { otId: e.ot2, tareaId: t.id, insumoId: e.lona, cantidad: 1, claveIdempotencia: uuid() })).status).toBe(400);
    await admin`UPDATE orden_trabajo SET estado = 'CANCELADO' WHERE id = ${e.ot2}`;
    expect((await e.op('POST', '/api/consumos', { otId: e.ot2, insumoId: e.lona, cantidad: 1, claveIdempotencia: uuid() })).status).toBe(409);
    expect((await e.op('POST', '/api/insumos', { nombre: 'zz x', unidad: 'M2', costoUnitarioGs: 1 })).status).toBe(403);
    const lista = (await e.op('GET', `/api/insumos?q=${encodeURIComponent('zz_test Lona front ' + e.tag)}`)).j as unknown as { costo_unitario_gs: number }[];
    expect(lista[0].costo_unitario_gs).toBe(63000);
  });
});
