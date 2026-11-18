import { describe, it, expect, afterAll } from 'vitest';
import { admin, api as apiDb, cerrarConexiones } from '../loop0/helpers.js';
import { sesion } from '../loop3/helpers-comercial.js';
import { app } from '../../apps/api/src/index.js';

/** Loop 21 — recibos de dinero y cobranzas (docs/LOOP_21_RECIBOS_DISENO.md). */
afterAll(cerrarConexiones);
const uuid = () => crypto.randomUUID();
let serie = Math.floor(Math.random() * 9_000_000);
const nroFactura = () => `001-0${String(Math.floor(Math.random() * 90) + 10)}-${String(++serie).padStart(7, '0')}`;
type Llamar = Awaited<ReturnType<typeof sesion>>;
type Factura = { id: string; numero: string; monto_gs: number; cobrado_gs: number; saldo_gs: number; estado: string };

async function escenario() {
  const tag = uuid().slice(0, 8);
  const sofi = await sesion(['comercial']);
  const cliente = async (n: string) => (await admin`INSERT INTO cliente (codigo, nombre, ruc) VALUES (${'Z21' + n + tag}, ${'zz_test_cli21_' + n + tag}, ${'800' + tag.slice(0, 4) + '-' + n}) RETURNING id`)[0].id as string;
  const c1 = await cliente('a');
  const c2 = await cliente('b');
  const factura = async (clienteId: string, monto: number, extra: Record<string, unknown> = {}) =>
    sofi('POST', '/api/cobranzas/facturas', { numero: nroFactura(), clienteId, fecha: '2026-11-05', montoGs: monto, ...extra });
  const recibo = (clienteId: string, aplicaciones: { facturaId: string; montoGs: number }[], extra: Record<string, unknown> = {}) =>
    sofi('POST', '/api/cobranzas/recibos', { clienteId, fecha: '2026-11-18', medio: 'TRANSFERENCIA', banco: 'Itaú', referencia: 'TRX-1',
      aplicaciones, claveIdempotencia: uuid(), ...extra });
  const facturas = async (clienteId: string) =>
    ((await sofi('GET', `/api/cobranzas/facturas?clienteId=${clienteId}&estado=TODAS`)).j.items as Factura[]);
  return { sofi, c1, c2, factura, recibo, facturas };
}

describe('Loop 21 — cobranzas', () => {
  it('CA-21.1: registrar factura; número repetido 409, mal formado 400; anular con cobro vigente 409', async () => {
    const e = await escenario();
    const f = await e.factura(e.c1, 500000);
    expect(f.status).toBe(201);
    expect((await e.sofi('POST', '/api/cobranzas/facturas', { numero: f.j.numero, clienteId: e.c1, fecha: '2026-11-05', montoGs: 10 })).status).toBe(409);
    expect((await e.sofi('POST', '/api/cobranzas/facturas', { numero: '1-1-123', clienteId: e.c1, fecha: '2026-11-05', montoGs: 10 })).status).toBe(400);
    await e.recibo(e.c1, [{ facturaId: f.j.id as string, montoGs: 100000 }]);
    expect((await e.sofi('POST', `/api/cobranzas/facturas/${f.j.id}/anular`, { motivo: 'zz_test error' })).status).toBe(409);
    const libre = await e.factura(e.c1, 70000);
    expect((await e.sofi('POST', `/api/cobranzas/facturas/${libre.j.id}/anular`, { motivo: 'zz_test cargada dos veces' })).status).toBe(200);
    expect((await e.facturas(e.c1)).find((x) => x.id === libre.j.id)?.estado).toBe('ANULADA');
  });

  it('CA-21.2: un recibo a 2 facturas (total y parcial) con retención; correlativo; reintento no duplica', async () => {
    const e = await escenario();
    const a = (await e.factura(e.c1, 321499)).j.id as string;
    const b = (await e.factura(e.c1, 1000000)).j.id as string;
    const clave = uuid();
    const r = await e.recibo(e.c1, [{ facturaId: a, montoGs: 321499 }, { facturaId: b, montoGs: 400000 }],
      { retencionesGs: 21499, retencionNumero: '001-001-0000123', claveIdempotencia: clave });
    expect(r.status).toBe(201);
    expect(r.j).toMatchObject({ importe_gs: 700000, retenciones_gs: 21499 });
    expect(r.j.numero).toMatch(/^REC-\d{4}-\d{4,}$/);
    const otra = await e.recibo(e.c1, [{ facturaId: b, montoGs: 100 }]);
    const n = (x: unknown) => Number(String(x).split('-')[2]);
    expect(n(otra.j.numero)).toBe(n(r.j.numero) + 1);
    const repetido = await e.recibo(e.c1, [{ facturaId: a, montoGs: 321499 }], { claveIdempotencia: clave });
    expect([repetido.status, repetido.j.id]).toEqual([200, r.j.id]);
    const fs = await e.facturas(e.c1);
    expect(fs.find((x) => x.id === a)).toMatchObject({ estado: 'PAGADA', saldo_gs: 0 });
    expect(fs.find((x) => x.id === b)).toMatchObject({ estado: 'PARCIAL', saldo_gs: 599900 });
    expect((await e.sofi('GET', `/api/cobranzas/clientes/${e.c1}/saldo`)).j).toMatchObject({ saldo_gs: 599900, facturas_pendientes: 1 });
    const d = await e.sofi('GET', `/api/cobranzas/recibos/${r.j.id}`);
    expect(d.j.monto_letras).toBe('setecientos mil guaraníes');
    expect((d.j.aplicaciones as { numero: string; monto_gs: number }[]).map((x) => x.monto_gs).sort()).toEqual([321499, 400000]);
    expect(d.j.cliente).toMatchObject({ nombre: expect.stringMatching(/zz_test_cli21_a/) });
  });

  it('CA-21.3: pasar el saldo 400; factura de otro cliente rechazada; la base no deja pasar el monto ni mezclar clientes', async () => {
    const e = await escenario();
    const a = (await e.factura(e.c1, 100000)).j.id as string;
    const otro = (await e.factura(e.c2, 50000)).j.id as string;
    expect((await e.recibo(e.c1, [{ facturaId: a, montoGs: 100001 }])).status).toBe(400);
    expect((await e.recibo(e.c1, [{ facturaId: otro, montoGs: 1000 }])).status).toBe(400);
    expect((await e.recibo(e.c1, [{ facturaId: a, montoGs: 5000 }], { retencionesGs: 5000 })).status).toBe(400); // importe 0
    const r = (await e.recibo(e.c1, [{ facturaId: a, montoGs: 90000 }])).j.id as string;
    // Directo en la base, como afull_api: ni pasar el monto ni aplicar a la factura de otro cliente.
    await expect(apiDb`INSERT INTO recibo_aplicacion (recibo_id, factura_id, cliente_id, monto_gs) VALUES (${r}, ${a}, ${e.c1}, ${20000})`)
      .rejects.toThrow();
    await expect(apiDb`INSERT INTO recibo_aplicacion (recibo_id, factura_id, cliente_id, monto_gs) VALUES (${r}, ${otro}, ${e.c1}, ${1000})`)
      .rejects.toThrow();
    // Dos recibos a la vez sobre los 10.000 que quedan: uno solo pasa.
    const [x, y] = await Promise.all([e.recibo(e.c1, [{ facturaId: a, montoGs: 10000 }]), e.recibo(e.c1, [{ facturaId: a, montoGs: 10000 }])]);
    expect([x.status, y.status].sort()).toEqual([201, 400]);
  });

  it('CA-21.4: anular un recibo devuelve el saldo; el recibo queda anulado; afull_api no puede tocar otras columnas ni borrar', async () => {
    const e = await escenario();
    const a = (await e.factura(e.c1, 200000)).j.id as string;
    const r = (await e.recibo(e.c1, [{ facturaId: a, montoGs: 200000 }])).j.id as string;
    expect((await e.sofi('POST', `/api/cobranzas/recibos/${r}/anular`, { motivo: 'zz_test cheque rechazado' })).status).toBe(200);
    expect((await e.sofi('POST', `/api/cobranzas/recibos/${r}/anular`, { motivo: 'otra vez' })).status).toBe(409);
    expect((await e.facturas(e.c1)).find((x) => x.id === a)).toMatchObject({ estado: 'PENDIENTE', saldo_gs: 200000 });
    const d = (await e.sofi('GET', `/api/cobranzas/recibos/${r}`)).j;
    expect(d).toMatchObject({ motivo_anulacion: 'zz_test cheque rechazado' });
    expect(d.anulado_at).toBeTruthy();
    await expect(apiDb`UPDATE recibo SET importe_gs = 1 WHERE id = ${r}`).rejects.toThrow(/permission denied/);
    await expect(apiDb`DELETE FROM recibo WHERE id = ${r}`).rejects.toThrow(/permission denied/);
    await expect(apiDb`UPDATE factura_cliente SET monto_gs = 1 WHERE id = ${a}`).rejects.toThrow(/permission denied/);
    await expect(apiDb`DELETE FROM recibo_aplicacion WHERE recibo_id = ${r}`).rejects.toThrow(/permission denied/);
  });

  it('CA-21.6: el portal ve solo sus recibos, sin notas internas ni quién lo emitió', async () => {
    const e = await escenario();
    const a = (await e.factura(e.c1, 300000)).j.id as string;
    const r = (await e.recibo(e.c1, [{ facturaId: a, montoGs: 300000 }], { nota: 'zz_test interno: lo cobró Gerardo' })).j.id as string;
    const ajeno = (await e.recibo(e.c2, [{ facturaId: (await e.factura(e.c2, 1000)).j.id as string, montoGs: 1000 }])).j.id as string;
    const acc = (await e.sofi('POST', '/api/portal-accesos', { clienteId: e.c1, descripcion: 'Compras' })).j;
    const portal = async (path: string) => {
      const res = await app.request(path, { headers: { origin: 'http://localhost:5173', authorization: `Portal ${acc.token}` } });
      return { status: res.status, j: (await res.json().catch(() => ({}))) as Record<string, unknown> };
    };
    const lista = await portal('/api/portal/recibos');
    expect((lista.j.items as { id: string }[]).map((x) => x.id)).toEqual([r]);
    const uno = await portal(`/api/portal/recibos/${r}`);
    expect(uno.status).toBe(200);
    expect(uno.j.monto_letras).toBe('trescientos mil guaraníes');
    expect(JSON.stringify(uno.j)).not.toMatch(/zz_test interno|emitido_por|nota/);
    expect((await portal(`/api/portal/recibos/${ajeno}`)).status).toBe(404);
  });

  it('CA-21.7 y datos de aFull: taller/montaje 403; los datos de aFull los cambia solo admin', async () => {
    for (const cap of ['taller', 'montaje']) expect((await (await sesion([cap]))('GET', '/api/cobranzas/facturas')).status).toBe(403);
    const sofi: Llamar = await sesion(['comercial']);
    const juan: Llamar = await sesion(['admin']);
    const [antes] = await admin`SELECT * FROM empresa_dato WHERE id = ${1}`;
    const datos = { razonSocial: 'zz_test aFull S.A.', ruc: '80012345-6', direccion: 'Av. Siempre Viva 123', ciudad: 'Asunción', telefono: '021 000 000', email: 'x@afull.com.py' };
    expect((await sofi('PUT', '/api/cobranzas/empresa', datos)).status).toBe(403);
    expect((await juan('PUT', '/api/cobranzas/empresa', datos)).status).toBe(200);
    expect((await sofi('GET', '/api/cobranzas/empresa')).j).toMatchObject({ ruc: '80012345-6', razon_social: 'zz_test aFull S.A.' });
    // En dev hay datos reales de aFull: se dejan como estaban.
    if (antes) await admin`UPDATE empresa_dato SET ${admin(antes, 'razon_social', 'ruc', 'direccion', 'ciudad', 'telefono', 'email')} WHERE id = ${1}`;
    else await admin`DELETE FROM empresa_dato WHERE id = ${1}`;
  });
});
