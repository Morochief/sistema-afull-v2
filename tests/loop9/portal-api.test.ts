import { describe, it, expect, afterAll } from 'vitest';
import { admin, api as apiDb, cerrarConexiones } from '../loop0/helpers.js';
import { sesion } from '../loop3/helpers-comercial.js';
import { app } from '../../apps/api/src/index.js';

afterAll(cerrarConexiones);
const uuid = () => crypto.randomUUID();
const ORIGEN = 'http://localhost:5173';

/** Cliente del portal: solo el token en el header, sin cookies. */
const portal = (token: string | null) => async (method: string, path: string, body?: unknown) => {
  const res = await app.request(path, {
    method,
    headers: { origin: ORIGEN, ...(token ? { authorization: `Portal ${token}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, j: (await res.json().catch(() => ({}))) as Record<string, unknown> };
};

async function escenario() {
  const tag = uuid().slice(0, 8);
  const sofi = await sesion(['comercial']);
  const cli = async (n: string) => {
    const [c] = await admin`INSERT INTO cliente (codigo, nombre) VALUES (${'Z9' + n + tag}, ${'zz_test_cli9' + n + '_' + tag}) RETURNING id`;
    const [s] = await admin`INSERT INTO sucursal (cliente_id, nombre, gps_lat, gps_lng) VALUES (${c.id}, ${'Local ' + n}, -25.28, -57.63) RETURNING id`;
    return { id: c.id as string, sucursal: s.id as string };
  };
  const a = await cli('A');
  const b = await cli('B');
  const acceso = await sofi('POST', '/api/portal-accesos', { clienteId: a.id, descripcion: 'Compras ' + tag });
  return { tag, sofi, a, b, acceso: acceso.j as { id: string; token: string }, status: acceso.status };
}

describe('Loop 9 — portal del cliente', () => {
  it('el token se muestra una vez y en la base solo queda su hash; no va a la auditoría (CA-9.1)', async () => {
    const e = await escenario();
    expect(e.status).toBe(201);
    expect(e.acceso.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const [fila] = await admin`SELECT token_hash FROM portal_acceso WHERE id = ${e.acceso.id}`;
    expect(fila.token_hash).not.toContain(e.acceso.token);
    expect(fila.token_hash).toMatch(/^[0-9a-f]{64}$/);
    const lista = (await e.sofi('GET', `/api/portal-accesos/cliente/${e.a.id}`)).j as unknown as Record<string, unknown>[];
    expect(JSON.stringify(lista)).not.toContain(e.acceso.token);
    const [aud] = await admin`SELECT count(*)::int AS n FROM evento_auditoria WHERE metadata::text LIKE ${'%' + e.acceso.token + '%'}`;
    expect(aud.n).toBe(0);
  });

  it('con el enlace ve sus locales, sus OTs sin montos y carga pedidos; nunca ve otro cliente (CA-9.2)', async () => {
    const e = await escenario();
    const p = portal(e.acceso.token);
    const yo = (await p('GET', '/api/portal/yo')).j as { cliente: string; sucursales: { id: string }[] };
    expect(yo.cliente).toContain('zz_test_cli9A');
    expect(yo.sucursales.map((s) => s.id)).toEqual([e.a.sucursal]);
    await e.sofi('POST', '/api/comercial/ot', { clienteId: e.a.id, titulo: 'zz_test Cartel A' });
    await e.sofi('POST', '/api/comercial/ot', { clienteId: e.b.id, titulo: 'zz_test Cartel B' });
    const ots = (await p('GET', '/api/portal/ots')).j as { items: Record<string, unknown>[] };
    expect(ots.items.map((o) => o.titulo)).toEqual(['zz_test Cartel A']);
    expect(Object.keys(ots.items[0]).some((k) => k.includes('_gs'))).toBe(false);
    // Pedido en un local propio: sí; en un local de otro cliente: no.
    const clave = uuid();
    const ped = await p('POST', '/api/portal/pedidos', { sucursalId: e.a.sucursal, descripcion: 'Cambiar lona del frente', fotoUrl: 'https://x.com/f.jpg', claveIdempotencia: clave });
    expect(ped.status).toBe(201);
    expect(ped.j.numero).toMatch(/^PED-\d{4}-\d{4,}$/);
    expect((await p('POST', '/api/portal/pedidos', { sucursalId: e.a.sucursal, descripcion: 'Cambiar lona del frente', claveIdempotencia: clave })).status).toBe(200);
    expect((await p('POST', '/api/portal/pedidos', { sucursalId: e.b.sucursal, descripcion: 'Intento ajeno', claveIdempotencia: uuid() })).status).toBe(400);
    const peds = (await p('GET', '/api/portal/pedidos')).j as { items: { numero: string }[] };
    expect(peds.items.map((x) => x.numero)).toEqual([ped.j.numero]);
  });

  it('sin token, token falso, revocado o vencido → 401 igual; revocado no se reactiva (CA-9.3)', async () => {
    const e = await escenario();
    for (const t of [null, 'x'.repeat(43), e.acceso.token.slice(0, -1) + (e.acceso.token.endsWith('A') ? 'B' : 'A')]) {
      const r = await portal(t)('GET', '/api/portal/yo');
      expect([r.status, r.j.error]).toEqual([401, 'Enlace inválido o vencido']);
    }
    // Una sesión interna (cookie) no sirve para el portal.
    expect((await e.sofi('GET', '/api/portal/yo')).status).toBe(401);
    expect((await e.sofi('POST', `/api/portal-accesos/${e.acceso.id}/revocar`)).status).toBe(200);
    expect((await portal(e.acceso.token)('GET', '/api/portal/yo')).status).toBe(401);
    await expect(apiDb`UPDATE portal_acceso SET activo = true WHERE id = ${e.acceso.id}`).rejects.toThrow();
    const otro = (await e.sofi('POST', '/api/portal-accesos', { clienteId: e.a.id, descripcion: 'vence', diasVigencia: 1 })).j as { id: string; token: string };
    await admin`ALTER TABLE portal_acceso DISABLE TRIGGER trg_portal_acceso_update`;
    await admin`UPDATE portal_acceso SET expira_at = now() - interval '1 minute' WHERE id = ${otro.id}`;
    await admin`ALTER TABLE portal_acceso ENABLE TRIGGER trg_portal_acceso_update`;
    expect((await portal(otro.token)('GET', '/api/portal/yo')).status).toBe(401);
  });

  it('Comercial convierte el pedido en OT del mismo local (una sola vez) o lo descarta con motivo (CA-9.4)', async () => {
    const e = await escenario();
    const p = portal(e.acceso.token);
    const id1 = (await p('POST', '/api/portal/pedidos', { sucursalId: e.a.sucursal, descripcion: 'Ploteo de vidriera', claveIdempotencia: uuid() })).j.id as string;
    const id2 = (await p('POST', '/api/portal/pedidos', { descripcion: 'Presupuesto de tótem', claveIdempotencia: uuid() })).j.id as string;
    const id3 = (await p('POST', '/api/portal/pedidos', { descripcion: 'Pedido repetido', claveIdempotencia: uuid() })).j.id as string;
    const c1 = await e.sofi('POST', `/api/pedidos/${id1}/convertir`, { a: 'OT' });
    expect(c1.status).toBe(200);
    const [ot] = await admin`SELECT cliente_id, sucursal_id, estado FROM orden_trabajo WHERE id = ${c1.j.orden_trabajo_id as string}`;
    expect([ot.cliente_id, ot.sucursal_id, ot.estado]).toEqual([e.a.id, e.a.sucursal, 'PENDIENTE']);
    expect((await e.sofi('POST', `/api/pedidos/${id1}/convertir`, { a: 'OT' })).status).toBe(409);
    const c2 = await e.sofi('POST', `/api/pedidos/${id2}/convertir`, { a: 'PRESUPUESTO', titulo: 'Tótem 2 m' });
    const [pre] = await admin`SELECT estado, titulo FROM presupuesto WHERE id = ${c2.j.presupuesto_id as string}`;
    expect([pre.estado, pre.titulo]).toEqual(['BORRADOR', 'Tótem 2 m']);
    expect((await e.sofi('POST', `/api/pedidos/${id3}/descartar`, {})).status).toBe(400);
    expect((await e.sofi('POST', `/api/pedidos/${id3}/descartar`, { motivo: 'Duplicado del PED anterior' })).status).toBe(200);
    // El cliente ve cómo quedó cada uno, con el estado de su OT en palabras de cliente desde la web.
    const vistos = (await p('GET', '/api/portal/pedidos')).j as { items: { id: string; estado: string; estado_ot: string | null; motivo_descarte: string | null }[] };
    const por = Object.fromEntries(vistos.items.map((x) => [x.id, x]));
    expect([por[id1].estado, por[id1].estado_ot]).toEqual(['CONVERTIDO', 'PENDIENTE']);
    expect(por[id3].motivo_descarte).toBe('Duplicado del PED anterior');
    // Lo que cargó el cliente no se toca, y operarios no ven la bandeja.
    await expect(apiDb`UPDATE pedido SET descripcion = 'x' WHERE id = ${id2}`).rejects.toThrow();
    const edu = await sesion(['taller']);
    expect((await edu('GET', '/api/pedidos')).status).toBe(403);
    expect((await edu('POST', '/api/portal-accesos', { clienteId: e.a.id, descripcion: 'x' })).status).toBe(403);
  });
});
