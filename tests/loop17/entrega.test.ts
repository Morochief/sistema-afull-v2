import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { admin, cerrarConexiones } from '../loop0/helpers.js';
import { sesion } from '../loop3/helpers-comercial.js';
import { app } from '../../apps/api/src/index.js';
import { AlmacenamientoMemoria, usarAlmacenamiento } from '../../apps/api/src/lib/almacenamiento.js';

/** Loop 17 — constancia de entrega en la parada (docs/LOOP_17_CONSTANCIA_ENTREGA_DISENO.md). */
let alm: AlmacenamientoMemoria;
beforeEach(() => {
  alm = new AlmacenamientoMemoria();
  usarAlmacenamiento(alm);
});
const personas: string[] = [];
afterAll(async () => {
  usarAlmacenamiento(null);
  await admin`UPDATE persona SET activo = false WHERE id = ANY(${personas}::uuid[])`;
  await cerrarConexiones();
});
const uuid = () => crypto.randomUUID();
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(new Date());
type Llamar = (m: string, p: string, b?: unknown) => Promise<{ status: number; j: Record<string, unknown> }>;

async function escenario(paradas = 1) {
  const tag = uuid().slice(0, 8);
  const sofi = await sesion(['comercial']);
  const carlos = await sesion(['montaje']);
  const [p] = await admin`INSERT INTO persona (nombre, ci) VALUES (${'zz_test_carlos17_' + tag}, ${'E17' + tag}) RETURNING id`;
  personas.push(p.id as string);
  await admin`UPDATE usuario SET persona_id = ${p.id} WHERE id = ${carlos.usuarioId}`;
  const [c] = await admin`INSERT INTO cliente (codigo, nombre) VALUES (${'Z17' + tag}, ${'zz_test_cli17_' + tag}) RETURNING id`;
  const [s] = await admin`INSERT INTO sucursal (cliente_id, nombre, gps_lat, gps_lng) VALUES (${c.id}, 'Luque', -25.2697, -57.4873) RETURNING id`;
  const ot = (await sofi('POST', '/api/comercial/ot', { clienteId: c.id, sucursalId: s.id, titulo: 'zz_test letrero' })).j;
  const hoja = (await sofi('POST', '/api/hojas-ruta', { fecha: hoy() })).j;
  await sofi('POST', `/api/hojas-ruta/${hoja.id}/personas`, { personaId: p.id, rol: 'CONDUCTOR' });
  const ids: string[] = [];
  for (let i = 0; i < paradas; i++) ids.push((await sofi('POST', `/api/hojas-ruta/${hoja.id}/paradas`, { ordenTrabajoId: ot.id })).j.id as string);
  const remision = async (paradaId: string) => {
    const a = await carlos('POST', '/api/archivos/solicitar', { tipo: 'REMISION_PARADA', paradaId, mime: 'image/jpeg', bytes: 900, claveIdempotencia: uuid() });
    if (a.status !== 201) return a.status;
    const [f] = await admin`SELECT ruta FROM archivo WHERE id = ${a.j.id as string}`;
    alm.objetos.set(f.ruta, { datos: new Uint8Array(900), mime: 'image/jpeg' });
    return (await carlos('POST', `/api/archivos/${a.j.id}/confirmar`)).status;
  };
  const portal = async (): Promise<Llamar> => {
    const acc = (await sofi('POST', '/api/portal-accesos', { clienteId: c.id, descripcion: 'Compras' })).j;
    return async (method, path, body) => {
      const res = await app.request(path, { method, headers: { origin: 'http://localhost:5173', authorization: `Portal ${acc.token}`,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
      return { status: res.status, j: (await res.json().catch(() => ({}))) as Record<string, unknown> };
    };
  };
  return { sofi, carlos, ot: ot.id as string, paradas: ids, remision, portal };
}
const completar = (s: Llamar, id: string, b: Record<string, unknown> = {}) => s('POST', `/api/campo/paradas/${id}/completar`, b);
type Entrega = { parada_id: string; receptor_nombre: string; receptor_cargo: string | null; entregada_at: string; sin_senal: boolean;
  completada_por: string | null; remision_archivo_id: string | null; remision_por_llegar: boolean };

describe('Loop 17 — constancia de entrega', () => {
  it('CA-17.1: con remisión y receptor, la OT muestra la entrega completa', async () => {
    const e = await escenario();
    expect(await e.remision(e.paradas[0])).toBe(200);
    expect((await completar(e.carlos, e.paradas[0], { receptorNombre: 'María Gómez', receptorCargo: 'encargada' })).status).toBe(200);
    const r = await e.sofi('GET', `/api/comercial/ot/${e.ot}/entregas`);
    expect(r.status).toBe(200);
    const [x] = r.j.entregas as Entrega[];
    expect(x).toMatchObject({ parada_id: e.paradas[0], receptor_nombre: 'María Gómez', receptor_cargo: 'encargada', sin_senal: false, remision_por_llegar: false });
    expect(x.remision_archivo_id).toBeTruthy();
    expect(x.completada_por).toMatch(/zz_test_carlos17_/);
    expect(r.j.lleva_remision).toBe(true);
  });

  it('CA-17.2: sin receptor → 400; sin foto en una OT que lleva remisión → 400; "no lleva remisión" → alcanza el receptor', async () => {
    const e = await escenario(2);
    expect((await completar(e.carlos, e.paradas[0])).status).toBe(400);
    const sinFoto = await completar(e.carlos, e.paradas[0], { receptorNombre: 'María' });
    expect([sinFoto.status, sinFoto.j.error]).toEqual([400, expect.stringMatching(/remisión/)]);
    expect((await e.carlos('POST', `/api/comercial/ot/${e.ot}/remision`, { lleva: false })).status).toBe(403);
    expect((await e.sofi('POST', `/api/comercial/ot/${e.ot}/remision`, { lleva: false })).status).toBe(200);
    expect((await completar(e.carlos, e.paradas[0], { receptorNombre: 'María' })).status).toBe(200);
  });

  it('la foto todavía en el celular (o sin señal) no frena: queda "por llegar" y se completa cuando sube', async () => {
    const e = await escenario(2);
    expect((await completar(e.carlos, e.paradas[0], { receptorNombre: 'Ana', remisionEnCelular: true })).status).toBe(200);
    expect((await completar(e.carlos, e.paradas[1], { receptorNombre: 'Ana', ocurridaAt: new Date(Date.now() - 600_000).toISOString() })).status).toBe(200);
    let ent = (await e.sofi('GET', `/api/comercial/ot/${e.ot}/entregas`)).j.entregas as Entrega[];
    expect(ent.map((x) => x.remision_por_llegar)).toEqual([true, true]);
    expect(ent.find((x) => x.parada_id === e.paradas[1])?.sin_senal).toBe(true);
    expect(await e.remision(e.paradas[0])).toBe(200);
    ent = (await e.sofi('GET', `/api/comercial/ot/${e.ot}/entregas`)).j.entregas as Entrega[];
    expect(ent.find((x) => x.parada_id === e.paradas[0])?.remision_por_llegar).toBe(false);
  });

  it('CA-17.3: una segunda entrega distinta → 409 y no se pisa; el mismo reintento → 200; la base no deja cambiarla', async () => {
    const e = await escenario();
    await e.remision(e.paradas[0]);
    expect((await completar(e.carlos, e.paradas[0], { receptorNombre: 'María', receptorCargo: 'cajera' })).status).toBe(200);
    expect((await completar(e.carlos, e.paradas[0], { receptorNombre: 'María', receptorCargo: 'cajera' })).status).toBe(200);
    expect((await completar(e.carlos, e.paradas[0], { receptorNombre: 'Pedro' })).status).toBe(409);
    await expect(admin`UPDATE hoja_ruta_parada SET receptor_nombre = 'Otro' WHERE id = ${e.paradas[0]}`).rejects.toThrow();
    const [p] = await admin`SELECT receptor_nombre, receptor_cargo FROM hoja_ruta_parada WHERE id = ${e.paradas[0]}`;
    expect([p.receptor_nombre, p.receptor_cargo]).toEqual(['María', 'cajera']);
    expect(await e.remision(e.paradas[0])).not.toBe(200); // una sola remisión por parada
  });

  it('CA-17.5: el portal muestra cuándo y quién recibió, sin la foto ni montos', async () => {
    const e = await escenario();
    await e.remision(e.paradas[0]);
    await completar(e.carlos, e.paradas[0], { receptorNombre: 'María Gómez', receptorCargo: 'encargada' });
    const cli = await e.portal();
    const r = await cli('GET', '/api/portal/ots');
    const ot = (r.j.items as { id: string; entrega: Record<string, unknown> | null }[]).find((o) => o.id === e.ot)!;
    expect(ot.entrega).toMatchObject({ receptor_nombre: 'María Gómez', receptor_cargo: 'encargada' });
    expect(Date.parse(ot.entrega!.entregada_at as string)).toBeGreaterThan(Date.now() - 120_000);
    expect(JSON.stringify(r.j)).not.toMatch(/archivo|remision|ruta|_gs|monto/);
    expect((await cli('GET', `/api/portal/archivos?paradaId=${e.paradas[0]}`)).status).not.toBe(200);
  });

  it('omitir una parada no pide entrega (como antes)', async () => {
    const e = await escenario();
    expect((await e.carlos('POST', `/api/campo/paradas/${e.paradas[0]}/omitir`, { motivo: 'cerrado' })).status).toBe(200);
  });
});
