import { describe, it, expect, afterAll } from 'vitest';
import { admin, cerrarConexiones } from '../loop0/helpers.js';
import { sesion, cliente, item } from './helpers-comercial.js';

afterAll(cerrarConexiones);

describe('L3.E2 — API de presupuestos', () => {
  it('crea en borrador con número PRE-AAAA-NNNN, evento inicial y auditoría', async () => {
    const api = await sesion(['comercial']);
    const c = await cliente();
    const r = await api('POST', '/api/presupuestos', { clienteId: c.id, titulo: 'zz_test marquesina' });
    expect(r.status).toBe(201);
    expect(r.j.numero).toMatch(/^PRE-\d{4}-\d{4,}$/);
    const d = await api('GET', `/api/presupuestos/${r.j.id}`);
    expect(d.j.estado).toBe('BORRADOR');
    expect((d.j.eventos as unknown[]).length).toBe(1);
    const [a] = await admin`SELECT count(*)::int AS n FROM evento_auditoria WHERE recurso_id = ${r.j.id as string}`;
    expect(a.n).toBeGreaterThanOrEqual(1);
  });

  it('valida ítems: sucursal de otro cliente y más de 4 decimales → 400', async () => {
    const api = await sesion(['comercial']);
    const c = await cliente();
    const otro = await cliente();
    const p = (await api('POST', '/api/presupuestos', { clienteId: c.id, titulo: 'zz_test' })).j;
    expect((await api('POST', `/api/presupuestos/${p.id}/items`, item({ sucursalId: otro.sucursal }))).status).toBe(400);
    expect((await api('POST', `/api/presupuestos/${p.id}/items`, item({ cantidad: 1.00001 }))).status).toBe(400);
    expect((await api('POST', `/api/presupuestos/${p.id}/items`, item({ sucursalId: c.sucursal }))).status).toBe(201);
  });

  it('enviar calcula el total en el servidor, exacto (170 × 1,15 = 196) y sin ítems inactivos', async () => {
    const api = await sesion(['comercial']);
    const c = await cliente();
    const p = (await api('POST', '/api/presupuestos', { clienteId: c.id, titulo: 'zz_test', margenPct: 15 })).j;
    await api('POST', `/api/presupuestos/${p.id}/items`, item());
    const inactivo = (await api('POST', `/api/presupuestos/${p.id}/items`, item({ precioUnitarioGs: 999999 }))).j;
    await api('PATCH', `/api/presupuestos/${p.id}/items/${inactivo.id}`, { activo: false });
    const e = await api('POST', `/api/presupuestos/${p.id}/enviar`, { desde: 'BORRADOR' });
    expect(e.status).toBe(200);
    expect(e.j.total_gs).toBe(196);
  });

  it('enviar rechaza sin ítems y con sucursales mezcladas', async () => {
    const api = await sesion(['comercial']);
    const c = await cliente();
    const p = (await api('POST', '/api/presupuestos', { clienteId: c.id, titulo: 'zz_test' })).j;
    expect((await api('POST', `/api/presupuestos/${p.id}/enviar`, { desde: 'BORRADOR' })).status).toBe(400);
    await api('POST', `/api/presupuestos/${p.id}/items`, item({ sucursalId: c.sucursal }));
    await api('POST', `/api/presupuestos/${p.id}/items`, item());
    expect((await api('POST', `/api/presupuestos/${p.id}/enviar`, { desde: 'BORRADOR' })).status).toBe(400);
  });

  it('CA-3.6: enviado, la cabecera y los ítems responden 409; dos envíos simultáneos → uno solo', async () => {
    const api = await sesion(['comercial']);
    const c = await cliente();
    const p = (await api('POST', '/api/presupuestos', { clienteId: c.id, titulo: 'zz_test' })).j;
    const it1 = (await api('POST', `/api/presupuestos/${p.id}/items`, item())).j;
    const envios = await Promise.all([
      api('POST', `/api/presupuestos/${p.id}/enviar`, { desde: 'BORRADOR' }),
      api('POST', `/api/presupuestos/${p.id}/enviar`, { desde: 'BORRADOR' }),
    ]);
    expect(envios.map((x) => x.status).sort()).toEqual([200, 409]);
    const d = (await api('GET', `/api/presupuestos/${p.id}`)).j;
    expect((await api('PATCH', `/api/presupuestos/${p.id}`, { margenPct: 50, updatedAt: d.updated_at })).status).toBe(409);
    expect((await api('POST', `/api/presupuestos/${p.id}/items`, item())).status).toBe(409);
    expect((await api('PATCH', `/api/presupuestos/${p.id}/items/${it1.id}`, { cantidad: 2 })).status).toBe(409);
    const eventos = await admin`SELECT estado_nuevo FROM presupuesto_evento WHERE presupuesto_id = ${p.id as string}`;
    expect(eventos.map((e) => e.estado_nuevo).sort()).toEqual(['BORRADOR', 'ENVIADO']);
  });

  it('nueva versión: v1 REEMPLAZADO, v2 BORRADOR con los ítems activos; versionar v1 otra vez → 409', async () => {
    const api = await sesion(['comercial']);
    const c = await cliente();
    const p = (await api('POST', '/api/presupuestos', { clienteId: c.id, titulo: 'zz_test' })).j;
    await api('POST', `/api/presupuestos/${p.id}/items`, item());
    const baja = (await api('POST', `/api/presupuestos/${p.id}/items`, item({ descripcion: 'sobra' }))).j;
    await api('PATCH', `/api/presupuestos/${p.id}/items/${baja.id}`, { activo: false });
    await api('POST', `/api/presupuestos/${p.id}/enviar`, { desde: 'BORRADOR' });
    const v2 = await api('POST', `/api/presupuestos/${p.id}/nueva-version`, { desde: 'ENVIADO' });
    expect(v2.status).toBe(201);
    expect(v2.j.version).toBe(2);
    const d2 = (await api('GET', `/api/presupuestos/${v2.j.id}`)).j;
    expect((d2.items as unknown[]).length).toBe(1);
    expect((d2.versiones as { estado: string }[]).map((v) => v.estado)).toEqual(['REEMPLAZADO', 'BORRADOR']);
    expect((await api('POST', `/api/presupuestos/${p.id}/nueva-version`, { desde: 'ENVIADO' })).status).toBe(409);
  });

  it('desde RECHAZADO, dos "nueva versión" simultáneas crean una sola', async () => {
    const api = await sesion(['comercial']);
    const c = await cliente();
    const p = (await api('POST', '/api/presupuestos', { clienteId: c.id, titulo: 'zz_test' })).j;
    await api('POST', `/api/presupuestos/${p.id}/items`, item());
    await api('POST', `/api/presupuestos/${p.id}/enviar`, { desde: 'BORRADOR' });
    expect((await api('POST', `/api/presupuestos/${p.id}/rechazar`, { desde: 'ENVIADO' })).status).toBe(400);
    expect((await api('POST', `/api/presupuestos/${p.id}/rechazar`, { desde: 'ENVIADO', comentario: 'caro' })).status).toBe(200);
    const r = await Promise.all([
      api('POST', `/api/presupuestos/${p.id}/nueva-version`, { desde: 'RECHAZADO' }),
      api('POST', `/api/presupuestos/${p.id}/nueva-version`, { desde: 'RECHAZADO' }),
    ]);
    expect(r.map((x) => x.status).sort()).toEqual([201, 409]);
  });

  it('anular exige motivo; el listado busca por nombre de cliente; taller → 403', async () => {
    const api = await sesion(['comercial']);
    const nombre = 'zz_test_Ferretería ' + crypto.randomUUID().slice(0, 6);
    const c = await cliente(nombre);
    const p = (await api('POST', '/api/presupuestos', { clienteId: c.id, titulo: 'zz_test' })).j;
    expect((await api('POST', `/api/presupuestos/${p.id}/anular`, { desde: 'BORRADOR' })).status).toBe(400);
    const an = await api('POST', `/api/presupuestos/${p.id}/anular`, { desde: 'BORRADOR', comentario: 'duplicado' });
    expect(an.status, JSON.stringify(an.j)).toBe(200);
    const l = (await api('GET', `/api/presupuestos?q=${encodeURIComponent(nombre)}`)).j;
    expect((l.items as { id: string }[]).map((x) => x.id)).toEqual([p.id]);
    const taller = await sesion(['taller']);
    expect((await taller('GET', '/api/presupuestos')).status).toBe(403);
  });
});
