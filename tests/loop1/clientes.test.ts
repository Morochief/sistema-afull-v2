import { describe, it, expect, afterAll } from 'vitest';
import { admin, api, cerrarConexiones } from '../loop0/helpers.js';
import { crearUsuario, post } from '../loop0/auth-helpers.js';
import { app } from '../../apps/api/src/index.js';
import { listarClientes } from '../../apps/api/src/modules/clientes/service.js';
import { crearOT } from '../../apps/api/src/modules/comercial/ot.service.js';

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

describe('CA-1.1: Paginación fija de 25, buscador, estado y rango de fechas en clientes', () => {
  it('pagina de a 25 filas exactas y filtra por q, activo y rango desde/hasta', async () => {
    const tag = Date.now().toString(36);
    await admin`
      INSERT INTO cliente (codigo, nombre, activo)
      SELECT ${'ZP-' + tag + '-'} || g, ${'zz_pag_' + tag + '_'} || lpad(g::text, 2, '0'), (g <= 26)
      FROM generate_series(1, 28) g
    `;
    try {
      const q = 'zz_pag_' + tag;
      const p1 = await listarClientes({ pagina: 1, q });
      expect(p1.tamPagina).toBe(25);
      expect(p1.total).toBe(28);
      expect(p1.totalPaginas).toBe(2);
      expect(p1.items).toHaveLength(25);

      const p2 = await listarClientes({ pagina: 2, q });
      expect(p2.items).toHaveLength(3);

      const inactivos = await listarClientes({ pagina: 1, q, activo: false });
      expect(inactivos.total).toBe(2);

      const manana = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
      const futuro = await listarClientes({ pagina: 1, q, desde: manana });
      expect(futuro.total).toBe(0);
    } finally {
      await admin`DELETE FROM cliente WHERE codigo LIKE ${'ZP-' + tag + '-%'}`;
    }
  });
});

describe('Detalle, sub-recursos, contacto principal transaccional, concurrencia 409 y auditoría', () => {
  it('gestiona cliente, sucursales, contactos (cambio de principal atómico) y marcas con control 409 y auditoría', async () => {
    const { u, cookie } = await sesionCookie(['comercial']);

    const resCli = await req('POST', '/api/clientes', cookie, {
      nombre: 'zz_test_empresa_' + Date.now(),
      razonSocial: 'Empresa Test S.A.',
    });
    expect(resCli.status).toBe(201);
    const cli = await resCli.json();

    // Edición con control optimista (updatedAt) y auditoría
    const resEdit = await req('PATCH', `/api/clientes/${cli.id}`, cookie, {
      nombre: cli.nombre + '_editado',
      updatedAt: cli.updated_at,
    });
    expect(resEdit.status).toBe(200);
    const cliEditado = await resEdit.json();

    // Reintentar con el updatedAt viejo debe dar 409
    const resStale = await req('PATCH', `/api/clientes/${cli.id}`, cookie, {
      nombre: 'no_debe_guardar',
      updatedAt: cli.updated_at,
    });
    expect(resStale.status).toBe(409);

    const aud = await admin`
      SELECT accion FROM evento_auditoria WHERE recurso = 'cliente' AND recurso_id = ${cli.id} AND usuario_id = ${u.id}
    `;
    expect(aud.map((a) => a.accion)).toEqual(expect.arrayContaining(['cliente.crear', 'cliente.editar']));

    // Sucursales
    const resSuc = await req('POST', `/api/clientes/${cli.id}/sucursales`, cookie, {
      nombre: 'Casa Matriz',
      ciudad: 'Asunción',
      gpsLat: -25.286,
      gpsLng: -57.647,
    });
    expect(resSuc.status).toBe(201);
    const suc = await resSuc.json();

    const resSucEdit = await req('PATCH', `/api/clientes/${cli.id}/sucursales/${suc.id}`, cookie, {
      ciudad: 'San Lorenzo',
      updatedAt: suc.updated_at,
    });
    expect(resSucEdit.status).toBe(200);
    const sucEdit = await resSucEdit.json();

    const resSucStale = await req('PATCH', `/api/clientes/${cli.id}/sucursales/${suc.id}`, cookie, {
      ciudad: 'Luque',
      updatedAt: suc.updated_at,
    });
    expect(resSucStale.status).toBe(409);

    const resSucDes = await req('PATCH', `/api/clientes/${cli.id}/sucursales/${suc.id}/estado`, cookie, {
      activo: false,
      updatedAt: sucEdit.updated_at,
    });
    expect(resSucDes.status).toBe(200);

    // Contactos: cambio de contacto principal en una sola transacción sin violar uq_contacto_principal
    const c1 = await (await req('POST', `/api/clientes/${cli.id}/contactos`, cookie, {
      nombre: 'Contacto 1',
      esPrincipal: true,
    })).json();
    expect(c1.es_principal).toBe(true);

    const c2 = await (await req('POST', `/api/clientes/${cli.id}/contactos`, cookie, {
      nombre: 'Contacto 2',
      esPrincipal: true,
    })).json();
    expect(c2.es_principal).toBe(true);

    // Volver a marcar c1 como principal mediante PATCH
    const resC1Prin = await req('PATCH', `/api/clientes/${cli.id}/contactos/${c1.id}`, cookie, {
      esPrincipal: true,
    });
    expect(resC1Prin.status).toBe(200);

    const principales = await admin`
      SELECT id FROM cliente_contacto WHERE cliente_id = ${cli.id} AND es_principal = true AND activo = true
    `;
    expect(principales).toHaveLength(1);
    expect(principales[0].id).toBe(c1.id);

    // Marcas
    const resMarca = await req('POST', `/api/clientes/${cli.id}/marcas`, cookie, { nombre: 'Marca Uno' });
    expect(resMarca.status).toBe(201);
    const marca = await resMarca.json();

    expect((await req('PATCH', `/api/clientes/${cli.id}/marcas/${marca.id}`, cookie, { nombre: 'Marca 1 Edit' })).status).toBe(200);
    expect((await req('PATCH', `/api/clientes/${cli.id}/marcas/${marca.id}/estado`, cookie, { activo: false })).status).toBe(200);

    // Detalle completo
    const resDet = await req('GET', `/api/clientes/${cli.id}`, cookie);
    expect(resDet.status).toBe(200);
    const det = await resDet.json();
    expect(det.id).toBe(cliEditado.id);
    expect(det.sucursales).toHaveLength(1);
    expect(det.contactos).toHaveLength(2);
    expect(det.marcas).toHaveLength(1);
  });
});

describe('CA-1.7: Sin borrado físico y desactivación con advertencia de OT abiertas', () => {
  it('desactiva/reactiva cliente advirtiendo OT abiertas y bloquea DELETE en afull_api con 42501', async () => {
    const { u, cookie } = await sesionCookie(['comercial']);
    const cli = await (await req('POST', '/api/clientes', cookie, { nombre: 'zz_test_desact_' + Date.now() })).json();
    await crearOT({ usuarioId: u.id }, { clienteId: cli.id, titulo: 'OT abierta' });

    const resDes = await req('PATCH', `/api/clientes/${cli.id}/estado`, cookie, {
      activo: false,
      updatedAt: cli.updated_at,
    });
    expect(resDes.status).toBe(200);
    const des = await resDes.json();
    expect(des.activo).toBe(false);
    expect(des.advertencia).toContain('1 OT(s) abierta(s)');

    const resReac = await req('PATCH', `/api/clientes/${cli.id}/estado`, cookie, {
      activo: true,
      updatedAt: des.updated_at,
    });
    expect(resReac.status).toBe(200);
    expect((await resReac.json()).activo).toBe(true);

    const tablas0004 = ['cliente', 'cliente_contacto', 'cliente_marca', 'sucursal', 'orden_trabajo', 'ot_evento'];
    for (const t of tablas0004) {
      const [{ borra }] = await admin`SELECT has_table_privilege('afull_api', ${'public.' + t}, 'DELETE') AS borra`;
      expect(borra).toBe(false);
    }

    await expect(api`DELETE FROM cliente WHERE id = ${cli.id}`).rejects.toMatchObject({ code: '42501' });
  });
});

describe('CA-1.10: Todos los endpoints de /api/clientes exigen comercial o admin (inspección de app.routes)', () => {
  it('recorre dinámicamente app.routes bajo /api/clientes y verifica 401 sin sesión y 403 sin capacidad', async () => {
    const { cookie: cookieTaller } = await sesionCookie(['taller']);
    const rutasClientes = app.routes.filter((r) => r.path.startsWith('/api/clientes') && r.method !== 'ALL');
    expect(rutasClientes.length).toBeGreaterThanOrEqual(14);

    const uuid = '00000000-0000-0000-0000-000000000000';
    for (const r of rutasClientes) {
      const pathReal = r.path.replace(/:[a-zA-Z]+/g, uuid);
      const sinSesion = await req(r.method, pathReal);
      expect(sinSesion.status, `${r.method} ${r.path} sin sesión debe ser 401`).toBe(401);

      const body = r.method === 'GET' ? undefined : {};
      const sinCapacidad = await req(r.method, pathReal, cookieTaller, body);
      expect(sinCapacidad.status, `${r.method} ${r.path} con rol taller debe ser 403`).toBe(403);
    }
  });
});
