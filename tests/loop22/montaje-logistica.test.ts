import { describe, it, expect, afterAll } from 'vitest';
import { admin, cerrarConexiones } from '../loop0/helpers.js';
import { sesion } from '../loop3/helpers-comercial.js';

/** Loop 22 (ajuste 26/11, José): el montaje va dentro de Logística, con Montaje, Desmontaje e Instalación. */
afterAll(cerrarConexiones);
type Proceso = { codigo: string; nombre: string; area: string; activo: boolean };

describe('CA-22.8 — montaje dentro de Logística', () => {
  it('Logística tiene Montaje / colocación, Desmontaje, Instalación y Reparación; el área Montaje ya no existe', async () => {
    const sofi = await sesion(['comercial']);
    const lista = (await sofi('GET', '/api/procesos')).j as unknown as Proceso[];
    const logistica = lista.filter((p) => p.area === 'LOGISTICA' && p.activo).map((p) => p.nombre);
    expect(logistica).toEqual(expect.arrayContaining(['Montaje / colocación', 'Desmontaje', 'Instalación', 'Reparación', 'Retiro de materiales']));
    expect(lista.filter((p) => p.area === 'MONTAJE')).toEqual([]);
    const juan = await sesion(['admin']);
    expect((await juan('POST', '/api/procesos', { nombre: 'zz montaje', area: 'MONTAJE' })).status).toBe(400);
    await expect(admin`UPDATE tipo_tarea SET area = 'MONTAJE' WHERE codigo = 'OTRO'`).rejects.toMatchObject({ code: '23514' });
  });
});
