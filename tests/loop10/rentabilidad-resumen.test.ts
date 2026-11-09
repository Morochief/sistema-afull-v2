import { describe, it, expect, afterAll } from 'vitest';
import { cerrarConexiones } from '../loop0/helpers.js';
import { sesion, ok, clienteConLocal, nuevaOT, llevarA, otConVenta } from './escenario.js';

afterAll(cerrarConexiones);

describe('Loop 10 — Resumen de rentabilidad (GET /api/costeo/ots)', () => {
  it('CA-10.6: el costo del resumen es el de las OTs con venta; el de las OTs sin presupuesto va aparte', async () => {
    const tag = crypto.randomUUID().slice(0, 8);
    const juan = await sesion(['admin']);
    const cli = await clienteConLocal(juan, tag);
    const ins = await ok(juan, 'POST', '/api/insumos', { nombre: `zz_test Lona10 ${tag}`, unidad: 'M2', costoUnitarioGs: 40_000 });
    const consumir = (otId: string, cantidad: number) =>
      ok(juan, 'POST', '/api/consumos', { otId, insumoId: ins.id, cantidad, claveIdempotencia: crypto.randomUUID() });

    // Con venta: 1.000.000 vendido, 5 m² × 40.000 = 200.000 de costo → margen 80 %.
    const venta = await otConVenta(juan, cli, tag);
    await llevarA(juan, venta.otId, ['PENDIENTE', 'EN_TALLER']);
    await consumir(venta.otId, 5);
    await llevarA(juan, venta.otId, ['EN_TALLER', 'TERMINADO']);
    // Sin venta: 3 m² = 120.000 de costo, no tiene margen.
    const sin = await nuevaOT(juan, cli, `zz_test sin venta ${tag}`);
    await llevarA(juan, sin.id, ['PENDIENTE', 'EN_TALLER']);
    await consumir(sin.id, 3);
    await llevarA(juan, sin.id, ['EN_TALLER', 'TERMINADO']);

    const r = await ok(juan, 'GET', `/api/costeo/ots?q=${tag}`);
    expect(r.total).toBe(2);
    expect(r.resumen).toEqual({ venta_gs: 1_000_000, costo_gs: 200_000, costo_sin_venta_gs: 120_000, margen_pct: 80 });
  });
});
