import { describe, it, expect, afterAll } from 'vitest';
import { admin, cerrarConexiones } from '../loop0/helpers.js';
import { sesion } from '../loop3/helpers-comercial.js';
import { puedeVerCostos } from '../../packages/shared/src/index.js';

afterAll(cerrarConexiones);

/** Decisión del usuario (2026-11-03): los operarios nunca ven precios; solo admin y comercial. */
describe('Loop 5 — los operarios no ven precios', () => {
  it('puedeVerCostos: admin y comercial sí; taller, montaje, diseño y rrhh no', () => {
    expect(puedeVerCostos(['admin'])).toBe(true);
    expect(puedeVerCostos(['comercial'])).toBe(true);
    for (const c of ['taller', 'montaje', 'diseno', 'rrhh']) expect(puedeVerCostos([c])).toBe(false);
  });

  it('catálogo de insumos: el operario recibe costo null; admin y comercial el precio', async () => {
    const tag = crypto.randomUUID().slice(0, 8);
    const juan = await sesion(['admin']);
    const nombre = 'zz_test Vinilo ' + tag;
    expect((await juan('POST', '/api/insumos', { nombre, unidad: 'M2', costoUnitarioGs: 42000 })).status).toBe(201);
    const q = `/api/insumos?q=${encodeURIComponent(nombre)}`;
    for (const caps of [['taller'], ['montaje'], ['diseno']]) {
      const l = (await (await sesion(caps))('GET', q)).j as unknown as { costo_unitario_gs: number | null; vigente_desde: string | null }[];
      expect(l).toHaveLength(1);
      expect(l[0].costo_unitario_gs).toBeNull();
      expect(l[0].vigente_desde).toBeNull();
    }
    for (const caps of [['admin'], ['comercial']]) {
      const l = (await (await sesion(caps))('GET', q)).j as unknown as { costo_unitario_gs: number }[];
      expect(l[0].costo_unitario_gs).toBe(42000);
    }
  });

  it('material de una OT (con costos): 403 para operarios, 200 para comercial', async () => {
    const tag = crypto.randomUUID().slice(0, 8);
    const sofi = await sesion(['comercial']);
    const [c] = await admin`INSERT INTO cliente (codigo, nombre) VALUES (${'ZV' + tag}, ${'zz_test_cli_cv_' + tag}) RETURNING id`;
    const ot = (await sofi('POST', '/api/comercial/ot', { clienteId: c.id, titulo: 'zz_test costos' })).j;
    for (const caps of [['taller'], ['montaje'], ['diseno']]) expect((await (await sesion(caps))('GET', `/api/consumos/ot/${ot.id}`)).status).toBe(403);
    expect((await sofi('GET', `/api/consumos/ot/${ot.id}`)).status).toBe(200);
  });

  it('vehículos: la cuadrilla no recibe el costo por km; comercial sí', async () => {
    const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
    await admin`INSERT INTO vehiculo (chapa, marca_modelo, costo_km_gs) VALUES (${'ZV' + tag}, 'zz_test Kangoo', 2500)`;
    for (const caps of [['montaje'], ['taller']]) {
      const l = (await (await sesion(caps))('GET', '/api/flota/vehiculos')).j as unknown as Record<string, unknown>[];
      expect(l.length).toBeGreaterThan(0);
      expect(l.every((v) => !('costo_km_gs' in v))).toBe(true);
    }
    const l = (await (await sesion(['comercial']))('GET', '/api/flota/vehiculos')).j as unknown as { chapa: string; costo_km_gs: number }[];
    expect(l.find((v) => v.chapa === 'ZV' + tag)?.costo_km_gs).toBe(2500);
  });
});
