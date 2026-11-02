import { describe, it, expect, afterAll } from 'vitest';
import { admin, cerrarConexiones } from '../loop0/helpers.js';
import { queryListarClientes } from '../../apps/api/src/modules/clientes/service.js';

const tag = Date.now().toString(36);

afterAll(async () => {
  await admin`DELETE FROM cliente WHERE codigo LIKE ${'ZZ-' + tag + '-%'}`;
  await cerrarConexiones();
});

describe('CA-1.2: Búsqueda con 5.000 clientes (consulta real del servicio)', () => {
  it('la consulta real de listarClientes se ejecuta en menos de 100 ms dentro del motor Postgres', async () => {
    await admin`
      INSERT INTO cliente (codigo, nombre, ruc)
      SELECT 'ZZ-' || ${tag} || '-' || g, 'cliente_test_' || md5(g::text || ${tag}), 'RUC-' || ${tag} || '-' || g
      FROM generate_series(1, 5000) g
    `;
    await admin`ANALYZE cliente`;
    const plan = await admin`
      EXPLAIN (ANALYZE, FORMAT JSON)
      ${queryListarClientes({ pagina: 1, q: 'ab12' }, admin)}
    `;
    const ms = plan[0]['QUERY PLAN'][0]['Execution Time'] as number;
    expect(ms).toBeLessThan(100);
  });
});
