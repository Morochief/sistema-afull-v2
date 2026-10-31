import { describe, it, expect, afterAll } from 'vitest';
import { admin, cerrarConexiones } from '../loop0/helpers.js';

const tag = Date.now().toString(36);

afterAll(async () => {
  await admin`DELETE FROM cliente WHERE codigo LIKE ${'ZZ-' + tag + '-%'}`;
  await cerrarConexiones();
});

describe('CA-1.2: Búsqueda con 5.000 clientes', () => {
  it('la consulta de búsqueda se ejecuta en menos de 100 ms dentro del motor Postgres', async () => {
    await admin`
      INSERT INTO cliente (codigo, nombre, ruc)
      SELECT 'ZZ-' || ${tag} || '-' || g, 'cliente_test_' || md5(g::text || ${tag}), 'RUC-' || ${tag} || '-' || g
      FROM generate_series(1, 5000) g
    `;
    await admin`ANALYZE cliente`;
    const plan = await admin.unsafe(`
      EXPLAIN (ANALYZE, FORMAT JSON)
      SELECT id FROM cliente
      WHERE nombre ILIKE '%ab12%' OR razon_social ILIKE '%ab12%' OR ruc ILIKE '%ab12%' OR codigo ILIKE '%ab12%'
      ORDER BY nombre, id LIMIT 25
    `);
    const ms = plan[0]['QUERY PLAN'][0]['Execution Time'] as number;
    expect(ms).toBeLessThan(100);
  });
});
