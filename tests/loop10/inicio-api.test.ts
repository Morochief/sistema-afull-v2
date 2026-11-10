import { describe, it, expect, afterAll } from 'vitest';
import { cerrarConexiones } from '../loop0/helpers.js';
import { app } from '../../apps/api/src/index.js';
import { sesion, ok, hoyAsuncion, clienteConLocal, nuevaOT, llevarA, otConVenta, pedidoPortal, operario } from './escenario.js';

afterAll(cerrarConexiones);

type Tablero = {
  ots_por_estado: Record<string, number>;
  trabajando_ahora: { persona: string; codigo_ot: string }[];
  atrasadas_total: number; atrasadas: { id: string }[];
  pedidos_nuevos_total: number; pedidos_nuevos: unknown[];
  disenos_por_verificar: number;
  presupuestos_enviados: { n: number; monto_gs: number };
  permisos_pendientes: number;
  hojas_hoy: { id: string; paradas: number; resueltas: number; cuadrilla: string | null; chapa: string | null }[];
  mes: { vendido_gs: number; costo_gs: number; ots: number } | null;
};
const n = (t: Tablero, e: string) => t.ots_por_estado[e] ?? 0;

describe('Loop 10 — Tablero de inicio (GET /api/inicio)', () => {
  it('CA-10.1: comercial y admin entran; taller recibe 403; sin sesión 401', async () => {
    expect((await (await sesion(['comercial']))('GET', '/api/inicio')).status).toBe(200);
    expect((await (await sesion(['admin']))('GET', '/api/inicio')).status).toBe(200);
    expect((await (await sesion(['taller']))('GET', '/api/inicio')).status).toBe(403);
    expect((await app.request('/api/inicio')).status).toBe(401);
  });

  it('CA-10.2 a CA-10.5: cada número sube exactamente lo que el escenario agrega', async () => {
    const tag = crypto.randomUUID().slice(0, 8);
    const juan = await sesion(['admin']);
    const leer = async () => (await ok(juan, 'GET', '/api/inicio')) as unknown as Tablero;
    const antes = await leer();
    const cli = await clienteConLocal(juan, tag);

    // 11 OTs atrasadas (más que el tope de 10 de la lista) + una prometida HOY (no está atrasada).
    for (let i = 1; i <= 11; i++) await nuevaOT(juan, cli, `zz_test atrasada ${i} ${tag}`, { fechaPrometida: `2025-01-${String(i).padStart(2, '0')}` });
    await nuevaOT(juan, cli, `zz_test prometida hoy ${tag}`, { fechaPrometida: hoyAsuncion() });
    // Atrasada pero cerrada: ni terminada ni cancelada cuentan como atrasadas.
    const term = await nuevaOT(juan, cli, `zz_test terminada sin venta ${tag}`, { fechaPrometida: '2025-02-01' });
    await llevarA(juan, term.id, ['PENDIENTE', 'EN_TALLER', 'TERMINADO']);
    const canc = await nuevaOT(juan, cli, `zz_test cancelada ${tag}`, { fechaPrometida: '2025-02-01' });
    await llevarA(juan, canc.id, ['PENDIENTE', 'CANCELADO'], 'zz_test motivo');

    // Una OT en diseño con una versión por verificar.
    const dis = await nuevaOT(juan, cli, `zz_test diseño ${tag}`);
    await llevarA(juan, dis.id, ['PENDIENTE', 'EN_DISENO']);
    await ok(juan, 'POST', `/api/disenos/ot/${dis.id}`, { origen: 'DISENADORA', driveUrl: `https://drive.google.com/file/d/zz${tag}/view` });

    // Un operario con el cronómetro en marcha en una OT en taller.
    const op = await operario(juan, ['taller', 'montaje'], tag);
    const tal = await nuevaOT(juan, cli, `zz_test taller ${tag}`, { activarHoja: true, tareas: [{ tipo: 'TALLER_IMPRESION', descripcion: 'zz_test', personaAsignadaId: op.personaId }] });
    await llevarA(juan, tal.id, ['PENDIENTE', 'EN_TALLER']);
    const [tarea] = (await ok(juan, 'GET', `/api/comercial/ot/${tal.id}/tareas`)) as unknown as { id: string }[];
    await ok(op.s, 'POST', `/api/mi-trabajo/tareas/${tarea.id}/iniciar`, { claveIdempotencia: crypto.randomUUID() });

    // Presupuesto enviado (no aprobado) y OT con venta terminada este mes.
    const pe = await ok(juan, 'POST', '/api/presupuestos', { clienteId: cli.clienteId, titulo: `zz_test enviado ${tag}`, margenPct: 0 });
    await ok(juan, 'POST', `/api/presupuestos/${pe.id}/items`, { concepto: 'OTRO', descripcion: 'zz', cantidad: 2, unidad: 'UNIDAD', precioUnitarioGs: 250_000 });
    const env = await ok(juan, 'POST', `/api/presupuestos/${pe.id}/enviar`, { desde: 'BORRADOR' });
    const venta = await otConVenta(juan, cli, tag);
    await llevarA(juan, venta.otId, ['PENDIENTE', 'EN_TALLER', 'TERMINADO']);
    const costoVenta = Number((await ok(juan, 'GET', `/api/costeo/ot/${venta.otId}`)).total_gs);

    // 6 pedidos del portal (más que el tope de 5) y un permiso pendiente.
    const acc = await ok(juan, 'POST', '/api/portal-accesos', { clienteId: cli.clienteId, descripcion: `zz_test ${tag}` });
    for (let i = 0; i < 6; i++) await pedidoPortal(acc.token, `zz_test pedido número ${i}`);
    await ok(juan, 'POST', '/api/permisos', { personaId: op.personaId, tipo: 'ESTUDIO', motivo: 'zz_test examen', modalidad: 'DIAS', fechaDesde: '2030-01-02', fechaHasta: '2030-01-02', claveIdempotencia: crypto.randomUUID() });

    // Hoja de ruta de hoy con el operario y 2 paradas; él omite una desde la calle.
    const hr = await ok(juan, 'POST', '/api/hojas-ruta', { fecha: hoyAsuncion(), descripcion: `zz_test hoja ${tag}` });
    await ok(juan, 'POST', `/api/hojas-ruta/${hr.id}/personas`, { personaId: op.personaId });
    await ok(juan, 'POST', `/api/hojas-ruta/${hr.id}/paradas`, { ordenTrabajoId: tal.id });
    await ok(juan, 'POST', `/api/hojas-ruta/${hr.id}/paradas`, { ordenTrabajoId: dis.id });
    const detalle = await ok(juan, 'GET', `/api/hojas-ruta/${hr.id}`);
    await ok(op.s, 'POST', `/api/campo/paradas/${detalle.paradas[1].id}/omitir`, { motivo: 'zz_test cerrado' });

    const d = await leer();
    // CA-10.2 OTs por estado (las canceladas no se muestran).
    expect(n(d, 'PENDIENTE') - n(antes, 'PENDIENTE')).toBe(12);
    expect(n(d, 'EN_DISENO') - n(antes, 'EN_DISENO')).toBe(1);
    expect(n(d, 'EN_TALLER') - n(antes, 'EN_TALLER')).toBe(1);
    expect(n(d, 'TERMINADO') - n(antes, 'TERMINADO')).toBe(2);
    expect(d.ots_por_estado.CANCELADO).toBeUndefined();
    // CA-10.3 y CA-10.4: atrasadas sin tope, sin la de hoy ni las cerradas; la lista tiene tope 10.
    expect(d.atrasadas_total - antes.atrasadas_total).toBe(11);
    expect(d.atrasadas.length).toBeLessThanOrEqual(10);
    expect(d.pedidos_nuevos_total - antes.pedidos_nuevos_total).toBe(6);
    expect(d.pedidos_nuevos.length).toBe(5);
    expect(d.disenos_por_verificar - antes.disenos_por_verificar).toBe(1);
    expect(d.permisos_pendientes - antes.permisos_pendientes).toBe(1);
    expect(d.presupuestos_enviados.n - antes.presupuestos_enviados.n).toBe(1);
    expect(d.presupuestos_enviados.monto_gs - antes.presupuestos_enviados.monto_gs).toBe(Number(env.total_gs));
    expect(d.trabajando_ahora.filter((w) => w.persona.includes(tag))).toHaveLength(1);
    expect(d.hojas_hoy.find((h) => h.id === hr.id)).toMatchObject({ paradas: 2, resueltas: 1, chapa: null, cuadrilla: expect.stringContaining(tag) });
    // CA-10.5: el mes suma solo la OT con venta.
    expect(d.mes!.ots - antes.mes!.ots).toBe(1);
    expect(d.mes!.vendido_gs - antes.mes!.vendido_gs).toBe(venta.monto);
    expect(d.mes!.costo_gs - antes.mes!.costo_gs).toBe(costoVenta);

    // Deja el cronómetro cerrado (la base de dev es compartida).
    await ok(op.s, 'POST', `/api/mi-trabajo/tareas/${tarea.id}/pausar`, { motivo: 'FIN', claveIdempotencia: crypto.randomUUID() });
  });
});
