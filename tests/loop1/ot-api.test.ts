import { describe, it, expect, afterAll } from 'vitest';
import { admin, cerrarConexiones } from '../loop0/helpers.js';
import { crearUsuario, post } from '../loop0/auth-helpers.js';
import { app } from '../../apps/api/src/index.js';

afterAll(cerrarConexiones);

const ORIGEN = process.env.APP_ORIGIN || 'http://localhost:3000';

async function sesionCookie(capacidades: string[]) {
  const u = await crearUsuario(capacidades);
  const res = await post('/api/auth/login', { username: u.username, password: 'Password123!' });
  return { u, cookie: res.headers.get('set-cookie')!.split(';')[0] };
}

function req(method: string, path: string, cookie?: string, body?: unknown) {
  const headers: Record<string, string> = { origin: ORIGEN };
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return app.request(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function clienteTest(nombre = 'zz_test_cli_ot') {
  const [c] = await admin`
    INSERT INTO cliente (codigo, nombre)
    VALUES (${'ZO-' + crypto.randomUUID().slice(0, 8)}, ${nombre}) RETURNING id
  `;
  return c.id as string;
}

describe('Detalle de OT, filtro por clienteId y coherencia de ot_evento (CA-1.8)', () => {
  it('devuelve detalle con historial ot_evento coincidente con estado actual y filtra por clienteId', async () => {
    const { cookie } = await sesionCookie(['comercial']);
    const clienteId = await clienteTest();
    const otroClienteId = await clienteTest();

    const resCrear = await req('POST', '/api/comercial/ot', cookie, {
      clienteId,
      titulo: 'OT Cartel Luminoso',
    });
    expect(resCrear.status).toBe(201);
    const ot = await resCrear.json();

    const resTrans = await req('POST', `/api/comercial/ot/${ot.id}/transicionar`, cookie, {
      desde: 'PENDIENTE',
      a: 'EN_TALLER',
    });
    expect(resTrans.status).toBe(200);

    const resDet = await req('GET', `/api/comercial/ot/${ot.id}`, cookie);
    expect(resDet.status).toBe(200);
    const det = await resDet.json();
    expect(det.estado).toBe('EN_TALLER');
    expect(det.eventos).toHaveLength(2);
    expect(det.eventos.at(-1).estado_nuevo).toBe(det.estado);

    const resListaCli = await req('GET', `/api/comercial/ot?clienteId=${clienteId}`, cookie);
    expect(resListaCli.status).toBe(200);
    const listaCli = await resListaCli.json();
    expect(listaCli.total).toBe(1);
    expect(listaCli.items[0].id).toBe(ot.id);

    const resListaOtro = await req('GET', `/api/comercial/ot?clienteId=${otroClienteId}`, cookie);
    expect((await resListaOtro.json()).total).toBe(0);
  });
});

describe('Edición de OT: updatedAt (409), cambio de sucursal (activa/inactiva/otro/null) y estados finales (400)', () => {
  it('edita con control 409, valida sucursal (permitiendo null) y audita ot.editar', async () => {
    const { u, cookie } = await sesionCookie(['comercial']);
    const clienteId = await clienteTest();
    const otroClienteId = await clienteTest();

    const [sucActiva] = await admin`
      INSERT INTO sucursal (cliente_id, nombre, gps_lat, gps_lng, activo)
      VALUES (${clienteId}, ${'suc_act_' + Date.now()}, -25.3, -57.6, true) RETURNING id
    `;
    const [sucInactiva] = await admin`
      INSERT INTO sucursal (cliente_id, nombre, gps_lat, gps_lng, activo)
      VALUES (${clienteId}, ${'suc_inact_' + Date.now()}, -25.3, -57.6, false) RETURNING id
    `;
    const [sucOtro] = await admin`
      INSERT INTO sucursal (cliente_id, nombre, gps_lat, gps_lng, activo)
      VALUES (${otroClienteId}, ${'suc_otro_' + Date.now()}, -25.3, -57.6, true) RETURNING id
    `;

    const ot = await (await req('POST', '/api/comercial/ot', cookie, {
      clienteId,
      titulo: 'OT Editable',
    })).json();

    // Asignar sucursal activa del cliente y cambiar título
    const resEdit1 = await req('PATCH', `/api/comercial/ot/${ot.id}`, cookie, {
      titulo: 'OT Editada 1',
      sucursalId: sucActiva.id,
      updatedAt: ot.updated_at,
    });
    expect(resEdit1.status).toBe(200);
    const ot1 = await resEdit1.json();
    expect(ot1.sucursal_id).toBe(sucActiva.id);

    // Con updatedAt viejo devuelve 409
    const resStale = await req('PATCH', `/api/comercial/ot/${ot.id}`, cookie, {
      titulo: 'Stale',
      updatedAt: ot.updated_at,
    });
    expect(resStale.status).toBe(409);

    // Sucursal inactiva o de otro cliente devuelve 400
    expect((await req('PATCH', `/api/comercial/ot/${ot.id}`, cookie, {
      sucursalId: sucInactiva.id,
      updatedAt: ot1.updated_at,
    })).status).toBe(400);

    expect((await req('PATCH', `/api/comercial/ot/${ot.id}`, cookie, {
      sucursalId: sucOtro.id,
      updatedAt: ot1.updated_at,
    })).status).toBe(400);

    // Pasar sucursalId: null está permitido
    const resNullSuc = await req('PATCH', `/api/comercial/ot/${ot.id}`, cookie, {
      sucursalId: null,
      updatedAt: ot1.updated_at,
    });
    expect(resNullSuc.status).toBe(200);
    const ot2 = await resNullSuc.json();
    expect(ot2.sucursal_id).toBeNull();

    const aud = await admin`
      SELECT accion FROM evento_auditoria WHERE recurso = 'orden_trabajo' AND recurso_id = ${ot.id} AND usuario_id = ${u.id}
    `;
    expect(aud.map((a) => a.accion)).toEqual(expect.arrayContaining(['ot.crear', 'ot.editar']));
  });

  it('bloquea con 400 la edición de una OT en estado TERMINADO o CANCELADO', async () => {
    const { cookie } = await sesionCookie(['comercial']);
    const clienteId = await clienteTest();

    // OT llevada a TERMINADO
    const otTerm = await (await req('POST', '/api/comercial/ot', cookie, { clienteId, titulo: 'OT Terminar' })).json();
    await req('POST', `/api/comercial/ot/${otTerm.id}/transicionar`, cookie, { desde: 'PENDIENTE', a: 'EN_TALLER' });
    await req('POST', `/api/comercial/ot/${otTerm.id}/transicionar`, cookie, { desde: 'EN_TALLER', a: 'TERMINADO' });
    const detTerm = await (await req('GET', `/api/comercial/ot/${otTerm.id}`, cookie)).json();

    const resEditTerm = await req('PATCH', `/api/comercial/ot/${otTerm.id}`, cookie, {
      titulo: 'Intento post terminado',
      updatedAt: detTerm.updated_at,
    });
    expect(resEditTerm.status).toBe(400);

    // OT llevada a CANCELADO
    const otCanc = await (await req('POST', '/api/comercial/ot', cookie, { clienteId, titulo: 'OT Cancelar' })).json();
    await req('POST', `/api/comercial/ot/${otCanc.id}/transicionar`, cookie, {
      desde: 'PENDIENTE',
      a: 'CANCELADO',
      comentario: 'Cancelado por cliente',
    });
    const detCanc = await (await req('GET', `/api/comercial/ot/${otCanc.id}`, cookie)).json();

    const resEditCanc = await req('PATCH', `/api/comercial/ot/${otCanc.id}`, cookie, {
      titulo: 'Intento post cancelado',
      updatedAt: detCanc.updated_at,
    });
    expect(resEditCanc.status).toBe(400);
  });
});

describe('CA-1.10 reforzado y CA-0.10 HTTP: Protección global de app.routes y 20 requests HTTP simultáneas', () => {
  it('recorre todas las rutas de app.routes exigiendo 401 sin sesión (salvo whitelist) y 403 en /api/comercial/ot sin capacidad', async () => {
    const { cookie: cookieTaller } = await sesionCookie(['taller']);
    const whitelistSinSesion = new Set(['POST /api/auth/login']);
    const uuid = '00000000-0000-0000-0000-000000000000';

    const todasLasRutas = app.routes.filter((r) => r.method !== 'ALL');
    expect(todasLasRutas.length).toBeGreaterThanOrEqual(20);

    for (const r of todasLasRutas) {
      const clave = `${r.method} ${r.path}`;
      if (whitelistSinSesion.has(clave)) continue;

      const pathReal = r.path.replace(/:[a-zA-Z]+/g, uuid);
      const body = r.method === 'GET' ? undefined : {};
      const sinSesion = await req(r.method, pathReal, undefined, body);
      expect(sinSesion.status, `${clave} sin sesión debe responder 401`).toBe(401);

      if (/^\/api\/(comercial\/ot|presupuestos|proyectos)/.test(r.path)) {
        const sinCap = await req(r.method, pathReal, cookieTaller, body);
        expect(sinCap.status, `${clave} con rol taller debe responder 403`).toBe(403);
      }
    }
  });

  it('CA-0.10: procesa 20 requests HTTP simultáneas por la API y el pooler sin errores', async () => {
    const { cookie } = await sesionCookie(['comercial']);
    const respuestas = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        req('GET', i % 2 === 0 ? '/api/clientes' : '/api/comercial/ot', cookie),
      ),
    );
    for (const r of respuestas) {
      expect(r.status).toBe(200);
      const body = await r.json();
      expect(body.tamPagina).toBe(25);
    }
  });
});
