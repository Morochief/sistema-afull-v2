import { describe, it, expect, afterAll } from 'vitest';
import { admin, cerrarConexiones } from '../loop0/helpers.js';
import { sesion, cliente, otraSucursal, presupuestoEnviado } from './helpers-comercial.js';

afterAll(cerrarConexiones);

describe('L3.E3 — aprobación, proyectos y OTs', () => {
  it('aprobar exige evidencia; sin sucursal → 1 OT sin proyecto con el total completo', async () => {
    const api = await sesion(['comercial']);
    const c = await cliente();
    const p = await presupuestoEnviado(api, c.id, [{ precioUnitarioGs: 100000 }]);
    expect((await api('POST', `/api/presupuestos/${p.id}/aprobar`, { desde: 'ENVIADO' })).status).toBe(400);
    const r = await api('POST', `/api/presupuestos/${p.id}/aprobar`, { desde: 'ENVIADO', comentario: 'OC 4512' });
    expect(r.status).toBe(200);
    expect(r.j.proyecto).toBeNull();
    const ots = r.j.ots as { id: string; monto_presupuestado_gs: number }[];
    expect(ots).toHaveLength(1);
    expect(ots[0].monto_presupuestado_gs).toBe(135000);
    const d = (await api('GET', `/api/comercial/ot/${ots[0].id}`)).j;
    expect(d.presupuesto_id).toBe(p.id);
    expect(d.estado).toBe('PENDIENTE');
    expect(typeof d.creado_por_nombre).toBe('string');
  });

  it('CA-3.5: 3 sucursales → 1 proyecto + 3 OTs; Σ montos = total exacto con montos que no dividen', async () => {
    const api = await sesion(['comercial']);
    const c = await cliente();
    const s2 = await otraSucursal(c.id, 'Luque ' + crypto.randomUUID().slice(0, 4));
    const s3 = await otraSucursal(c.id, 'Villa Elisa ' + crypto.randomUUID().slice(0, 4));
    const p = await presupuestoEnviado(
      api, c.id,
      [{ sucursalId: c.sucursal, precioUnitarioGs: 1 }, { sucursalId: s2, precioUnitarioGs: 1 }, { sucursalId: s3, precioUnitarioGs: 1 }],
      50
    );
    expect(p.total).toBe(5); // 3 × 1,5 = 4,5 → 5
    const r = await api('POST', `/api/presupuestos/${p.id}/aprobar`, { desde: 'ENVIADO', comentario: 'WhatsApp' });
    const ots = r.j.ots as { monto_presupuestado_gs: number }[];
    expect(ots).toHaveLength(3);
    expect(ots.reduce((a, o) => a + o.monto_presupuestado_gs, 0)).toBe(5);
    const py = (await api('GET', `/api/proyectos/${(r.j.proyecto as { id: string }).id}`)).j;
    expect((py.ordenes_trabajo as unknown[]).length).toBe(3);
    expect(py.total_presupuestado_gs).toBe(5);
  });

  it('CA-3.4: dos aprobaciones simultáneas → una sola, y un solo juego de OTs', async () => {
    const api = await sesion(['comercial']);
    const c = await cliente();
    const p = await presupuestoEnviado(api, c.id, [{ precioUnitarioGs: 1000 }]);
    const r = await Promise.all([
      api('POST', `/api/presupuestos/${p.id}/aprobar`, { desde: 'ENVIADO', comentario: 'a' }),
      api('POST', `/api/presupuestos/${p.id}/aprobar`, { desde: 'ENVIADO', comentario: 'b' }),
    ]);
    expect(r.map((x) => x.status).sort()).toEqual([200, 409]);
    const [{ n }] = await admin`SELECT count(*)::int AS n FROM orden_trabajo WHERE presupuesto_id = ${p.id}`;
    expect(n).toBe(1);
  });

  it('CA-3.7: el proyecto no se cierra con OTs abiertas; cancelar exige motivo', async () => {
    const api = await sesion(['comercial']);
    const c = await cliente();
    const s2 = await otraSucursal(c.id, 'San Lorenzo ' + crypto.randomUUID().slice(0, 4));
    const p = await presupuestoEnviado(api, c.id, [{ sucursalId: c.sucursal }, { sucursalId: s2 }]);
    const r = await api('POST', `/api/presupuestos/${p.id}/aprobar`, { desde: 'ENVIADO', comentario: 'OC 1' });
    const pyId = (r.j.proyecto as { id: string }).id;
    const cerrar = await api('POST', `/api/proyectos/${pyId}/cerrar`, {});
    expect(cerrar.status).toBe(409);
    expect(String(cerrar.j.error)).toMatch(/OT-/);
    expect((await api('POST', `/api/proyectos/${pyId}/cancelar`, {})).status).toBe(400);
    for (const ot of r.j.ots as { id: string }[]) {
      await api('POST', `/api/comercial/ot/${ot.id}/transicionar`, { desde: 'PENDIENTE', a: 'CANCELADO', comentario: 'cliente desistió' });
    }
    expect((await api('POST', `/api/proyectos/${pyId}/cancelar`, { comentario: 'cliente desistió' })).status).toBe(200);
  });

  it('una OT directa se asocia a un proyecto abierto del mismo cliente; una OT de presupuesto no', async () => {
    const api = await sesion(['comercial']);
    const c = await cliente();
    const otro = await cliente();
    const s2 = await otraSucursal(c.id, 'Lambaré ' + crypto.randomUUID().slice(0, 4));
    const p = await presupuestoEnviado(api, c.id, [{ sucursalId: c.sucursal }, { sucursalId: s2 }]);
    const r = await api('POST', `/api/presupuestos/${p.id}/aprobar`, { desde: 'ENVIADO', comentario: 'OC 2' });
    const pyId = (r.j.proyecto as { id: string }).id;
    const directa = (await api('POST', '/api/comercial/ot', { clienteId: c.id, titulo: 'zz_test urgencia' })).j;
    const ok = await api('POST', `/api/comercial/ot/${directa.id}/proyecto`, { proyectoId: pyId, updatedAt: directa.updated_at });
    expect(ok.status).toBe(200);
    const deOtro = (await api('POST', '/api/comercial/ot', { clienteId: otro.id, titulo: 'zz_test ajena' })).j;
    expect((await api('POST', `/api/comercial/ot/${deOtro.id}/proyecto`, { proyectoId: pyId, updatedAt: deOtro.updated_at })).status).toBe(400);
    const otP = (await api('GET', `/api/comercial/ot/${(r.j.ots as { id: string }[])[0].id}`)).j;
    expect((await api('POST', `/api/comercial/ot/${otP.id}/proyecto`, { proyectoId: null, updatedAt: otP.updated_at })).status).toBe(409);
    expect((await (await sesion(['taller']))('GET', '/api/proyectos')).status).toBe(403);
  });
});
