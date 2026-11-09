import { describe, it, expect, afterAll } from 'vitest';
import { estadoPedidoCliente } from '../../packages/shared/src/index.js';
import { cerrarConexiones } from '../loop0/helpers.js';
import { app } from '../../apps/api/src/index.js';
import { sesion, ok, clienteConLocal, llevarA, pedidoPortal, type Sesion } from '../loop10/escenario.js';

afterAll(cerrarConexiones);

type PedidoPortal = { numero: string; descripcion: string; codigo_ot: string | null; estado_ot: string | null; presupuesto_numero: string | null; presupuesto_estado: string | null; estado: string; motivo_descarte: string | null };

/** Escenario: cliente con local, enlace del portal y un pedido NUEVO; devuelve cómo lo ve el cliente en cada momento. */
async function escenario() {
  const tag = crypto.randomUUID().slice(0, 8);
  const sofi = await sesion(['comercial']);
  const cli = await clienteConLocal(sofi, tag);
  const acc = await ok(sofi, 'POST', '/api/portal-accesos', { clienteId: cli.clienteId, descripcion: `zz_test ${tag}` });
  await pedidoPortal(acc.token, `zz_test pedido ${tag}`, cli.sucursalId);
  const [pedido] = (await ok(sofi, 'GET', `/api/pedidos?q=${tag}`)).items as { id: string }[];
  const comoLoVe = async () => {
    const res = await app.request('/api/portal/pedidos', { headers: { authorization: `Portal ${acc.token}` } });
    const p = ((await res.json()) as { items: PedidoPortal[] }).items.find((x) => x.descripcion.includes(tag))!;
    return { ...p, texto: estadoPedidoCliente(p).texto };
  };
  const convertir = (a: 'OT' | 'PRESUPUESTO') => ok(sofi, 'POST', `/api/pedidos/${pedido.id}/convertir`, { a });
  return { tag, sofi, cli, pedido, comoLoVe, convertir };
}

/** Ítem con el local y envío del presupuesto (lo que hace Sofi antes de mandarlo). */
async function cotizarYEnviar(sofi: Sesion, presupuestoId: string, sucursalId: string, desde = 'BORRADOR') {
  await ok(sofi, 'POST', `/api/presupuestos/${presupuestoId}/items`, { sucursalId, concepto: 'MATERIAL', descripcion: 'Lona', cantidad: 1, unidad: 'UNIDAD', precioUnitarioGs: 500_000 });
  await ok(sofi, 'POST', `/api/presupuestos/${presupuestoId}/enviar`, { desde });
}

describe('L9.E2 — el cliente sigue su pedido hasta el final', () => {
  it('CA-9.5: pedido → OT directa (sin presupuesto) sigue los cambios de estado de la OT', async () => {
    const e = await escenario();
    expect((await e.comoLoVe()).texto).toBe('Recibido');
    const r = await e.convertir('OT');
    const v = await e.comoLoVe();
    expect(v).toMatchObject({ estado_ot: 'PENDIENTE', presupuesto_numero: null });
    await llevarA(e.sofi, r.orden_trabajo_id, ['PENDIENTE', 'EN_TALLER']);
    expect((await e.comoLoVe()).texto).toBe('En producción');
  });

  it('CA-9.6: pedido → presupuesto → aprobado: deja de decir "Presupuestando" y sigue la OT generada', async () => {
    const e = await escenario();
    const r = await e.convertir('PRESUPUESTO');
    expect((await e.comoLoVe()).texto).toBe('Presupuestando');
    await cotizarYEnviar(e.sofi, r.presupuesto_id, e.cli.sucursalId);
    expect((await e.comoLoVe()).texto).toBe('Presupuestando');
    const ap = await ok(e.sofi, 'POST', `/api/presupuestos/${r.presupuesto_id}/aprobar`, { desde: 'ENVIADO', comentario: 'zz_test OC' });
    const v = await e.comoLoVe();
    expect(v.codigo_ot).toBe(ap.ots[0].codigo_ot);
    expect(v.texto).toBe('Recibido');
    await llevarA(e.sofi, ap.ots[0].id, ['PENDIENTE', 'EN_DISENO']);
    expect((await e.comoLoVe()).texto).toBe('En diseño');
  });

  it('CA-9.7: si el presupuesto pasa a una versión nueva, el pedido sigue la vigente', async () => {
    const e = await escenario();
    const r = await e.convertir('PRESUPUESTO');
    await cotizarYEnviar(e.sofi, r.presupuesto_id, e.cli.sucursalId);
    const v2 = await ok(e.sofi, 'POST', `/api/presupuestos/${r.presupuesto_id}/nueva-version`, { desde: 'ENVIADO' });
    expect(await e.comoLoVe()).toMatchObject({ presupuesto_estado: 'BORRADOR', texto: 'Presupuestando' });
    await cotizarYEnviar(e.sofi, v2.id, e.cli.sucursalId);
    const ap = await ok(e.sofi, 'POST', `/api/presupuestos/${v2.id}/aprobar`, { desde: 'ENVIADO', comentario: 'zz_test OC v2' });
    expect((await e.comoLoVe()).codigo_ot).toBe(ap.ots[0].codigo_ot);
  });

  it('CA-9.8: presupuesto rechazado → "No se realizará", sin el comentario interno', async () => {
    const e = await escenario();
    const r = await e.convertir('PRESUPUESTO');
    await cotizarYEnviar(e.sofi, r.presupuesto_id, e.cli.sucursalId);
    await ok(e.sofi, 'POST', `/api/presupuestos/${r.presupuesto_id}/rechazar`, { desde: 'ENVIADO', comentario: 'zz_test caro según el gerente' });
    const v = await e.comoLoVe();
    expect(v).toMatchObject({ presupuesto_estado: 'RECHAZADO', codigo_ot: null, texto: 'No se realizará' });
    expect(JSON.stringify(v)).not.toContain('caro según el gerente');
  });

  it('CA-9.9 y CA-9.10: presupuesto de varios locales → la OT del local del pedido; la bandeja interna la muestra', async () => {
    const e = await escenario();
    const otro = await ok(e.sofi, 'POST', `/api/clientes/${e.cli.clienteId}/sucursales`, { nombre: 'Otro local', gpsLat: -25.3, gpsLng: -57.6 });
    const r = await e.convertir('PRESUPUESTO');
    await ok(e.sofi, 'POST', `/api/presupuestos/${r.presupuesto_id}/items`, { sucursalId: otro.id, concepto: 'MATERIAL', descripcion: 'Lona', cantidad: 1, unidad: 'UNIDAD', precioUnitarioGs: 300_000 });
    await cotizarYEnviar(e.sofi, r.presupuesto_id, e.cli.sucursalId);
    const ap = await ok(e.sofi, 'POST', `/api/presupuestos/${r.presupuesto_id}/aprobar`, { desde: 'ENVIADO', comentario: 'zz_test OC' });
    const delLocal = (ap.ots as { codigo_ot: string; sucursal_id: string }[]).find((o) => o.sucursal_id === e.cli.sucursalId)!;
    expect((await e.comoLoVe()).codigo_ot).toBe(delLocal.codigo_ot);
    const interno = (await ok(e.sofi, 'GET', `/api/pedidos?q=${e.tag}`)).items[0];
    expect(interno.codigo_ot).toBe(delLocal.codigo_ot);
  });
});

describe('estadoPedidoCliente (regla única del texto que ve el cliente)', () => {
  const base = { estado: 'CONVERTIDO', motivo_descarte: null, codigo_ot: null, estado_ot: null, presupuesto_numero: null, presupuesto_estado: null };
  it.each([
    [{ ...base, estado: 'NUEVO' }, 'Recibido'],
    [{ ...base, estado: 'DESCARTADO', motivo_descarte: 'x' }, 'No se realizará'],
    [{ ...base, presupuesto_numero: 'PRE-1', presupuesto_estado: 'ENVIADO' }, 'Presupuestando'],
    [{ ...base, presupuesto_numero: 'PRE-1', presupuesto_estado: 'ANULADO' }, 'No se realizará'],
    [{ ...base, codigo_ot: 'OT-1', estado_ot: 'EN_MONTAJE' }, 'En instalación'],
    [{ ...base, codigo_ot: 'OT-1', estado_ot: 'TERMINADO' }, 'Terminado'],
  ])('%o → %s', (p, texto) => expect(estadoPedidoCliente(p).texto).toBe(texto));
});
