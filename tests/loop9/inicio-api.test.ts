import { describe, it, expect, afterAll } from 'vitest';
import { cerrarConexiones } from '../loop0/helpers.js';
import { sesion } from '../loop3/helpers-comercial.js';

afterAll(cerrarConexiones);

describe('Tablero de inicio (GET /api/inicio)', () => {
  it('comercial y admin lo ven con los montos del mes (puedeVerCostos); taller no entra', async () => {
    const sofi = await sesion(['comercial']);
    const r = await sofi('GET', '/api/inicio');
    expect(r.status).toBe(200);
    expect(r.j).toMatchObject({ ots_por_estado: expect.any(Object), trabajando_ahora: expect.any(Array), atrasadas: expect.any(Array), pedidos_nuevos: expect.any(Array), hojas_hoy: expect.any(Array) });
    expect(typeof r.j.disenos_por_verificar).toBe('number');
    expect(typeof r.j.permisos_pendientes).toBe('number');
    expect(r.j.mes).toMatchObject({ vendido_gs: expect.any(Number) });

    const juan = await sesion(['admin']);
    const a = await juan('GET', '/api/inicio');
    expect(a.status).toBe(200);
    expect(a.j.mes).toMatchObject({ vendido_gs: expect.any(Number), costo_gs: expect.any(Number), ots: expect.any(Number) });

    const edu = await sesion(['taller']);
    expect((await edu('GET', '/api/inicio')).status).toBe(403);
  });
});
