import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { admin, cerrarConexiones } from '../loop0/helpers.js';
import { sesion } from '../loop3/helpers-comercial.js';
import { app } from '../../apps/api/src/index.js';
import { AlmacenamientoMemoria, usarAlmacenamiento } from '../../apps/api/src/lib/almacenamiento.js';

/** L4.E3 — muestras de impresión, comprobantes de permisos y fotos de pedidos del portal. */
let alm: AlmacenamientoMemoria;
beforeEach(() => {
  alm = new AlmacenamientoMemoria();
  usarAlmacenamiento(alm);
});
afterAll(async () => {
  usarAlmacenamiento(null);
  await cerrarConexiones();
});
const uuid = () => crypto.randomUUID();
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(new Date());
const foto = (extra: Record<string, unknown> = {}) => ({ mime: 'image/jpeg', bytes: 900, claveIdempotencia: uuid(), ...extra });
type Llamar = (m: string, p: string, b?: unknown) => Promise<{ status: number; j: Record<string, unknown> }>;

/** Pedir, subir y confirmar: devuelve el estado de la confirmación. */
async function subirCompleto(api: Llamar, base: string, cuerpo: Record<string, unknown>, bytes = 900) {
  const a = await api('POST', `${base}/solicitar`, cuerpo);
  if (a.status !== 201) return a.status;
  const [f] = await admin`SELECT ruta FROM archivo WHERE id = ${a.j.id as string}`;
  alm.objetos.set(f.ruta, { datos: new Uint8Array(bytes), mime: cuerpo.mime as string });
  return (await api('POST', `${base}/${a.j.id}/confirmar`)).status;
}

async function persona(s: { usuarioId: string }, n: string) {
  const tag = uuid().slice(0, 8);
  const [p] = await admin`INSERT INTO persona (nombre, ci) VALUES (${'zz_test_us' + n + tag}, ${'U4' + n + tag}) RETURNING id`;
  await admin`UPDATE usuario SET persona_id = ${p.id} WHERE id = ${s.usuarioId}`;
  return p.id as string;
}

describe('L4.E3 — muestras, comprobantes y pedidos', () => {
  it('muestra de impresión: la sube quien hace la tarea o taller; montaje ajeno no; comercial la ve', async () => {
    const tag = uuid().slice(0, 8);
    const sofi = await sesion(['comercial']);
    const edu = await sesion(['taller']);
    const asignado = await sesion(['diseno']);
    const ajeno = await sesion(['montaje']);
    const pAsig = await persona(asignado, 'asig');
    await persona(ajeno, 'aj');
    const [c] = await admin`INSERT INTO cliente (codigo, nombre) VALUES (${'ZM' + tag}, ${'zz_test_cliM_' + tag}) RETURNING id`;
    const ot = (await sofi('POST', '/api/comercial/ot', {
      clienteId: c.id, titulo: 'zz_test muestra',
      tareas: [{ tipo: 'TALLER_IMPRESION', descripcion: 'Lona front', personaAsignadaId: pAsig }],
    })).j;
    const [t] = await admin`SELECT id FROM tarea WHERE orden_trabajo_id = ${ot.id as string}`;
    expect(await subirCompleto(edu, '/api/archivos', foto({ tipo: 'MUESTRA_TAREA', tareaId: t.id }))).toBe(200);
    expect(await subirCompleto(asignado, '/api/archivos', foto({ tipo: 'MUESTRA_TAREA', tareaId: t.id, mime: 'image/webp' }))).toBe(200);
    expect(await subirCompleto(ajeno, '/api/archivos', foto({ tipo: 'MUESTRA_TAREA', tareaId: t.id }))).toBe(403);
    const lista = (await sofi('GET', `/api/archivos?tareaId=${t.id}`)).j as unknown as { subido_por: string }[];
    expect(lista).toHaveLength(2);
    expect((await ajeno('GET', `/api/archivos?tareaId=${t.id}`)).status).toBe(404);
    const [aud] = await admin`SELECT count(*)::int AS n FROM evento_auditoria WHERE accion = 'archivo.subir' AND usuario_id = ${edu.usuarioId}`;
    expect(aud.n).toBe(1);
  });

  it('comprobante de permiso (PDF): lo sube el empleado; otro no lo ve; RR.HH. sí; tope de 3', async () => {
    const edu = await sesion(['taller']);
    const otro = await sesion(['montaje']);
    const rrhh = await sesion(['rrhh']);
    await persona(edu, 'edu');
    await persona(otro, 'otro');
    const s = (await edu('POST', '/api/permisos', {
      tipo: 'SALUD', detalleTipo: 'Gripe', motivo: 'Reposo médico de dos días', modalidad: 'DIAS', fechaDesde: hoy(), fechaHasta: hoy(), claveIdempotencia: uuid(),
    })).j;
    const pdf = () => foto({ tipo: 'COMPROBANTE_PERMISO', solicitudId: s.id, mime: 'application/pdf', bytes: 8 * 1048576 });
    expect(await subirCompleto(edu, '/api/archivos', pdf(), 8 * 1048576)).toBe(200);
    expect(await subirCompleto(otro, '/api/archivos', pdf())).toBe(404);
    expect((await otro('GET', `/api/archivos?solicitudId=${s.id}`)).status).toBe(404);
    expect(((await rrhh('GET', `/api/archivos?solicitudId=${s.id}`)).j as unknown as unknown[]).length).toBe(1);
    expect(await subirCompleto(rrhh, '/api/archivos', foto({ tipo: 'COMPROBANTE_PERMISO', solicitudId: s.id }))).toBe(200);
    expect(await subirCompleto(edu, '/api/archivos', pdf(), 1000)).toBe(200);
    expect(await subirCompleto(edu, '/api/archivos', pdf())).toBe(409);
  });

  it('foto del pedido: el cliente la sube a SU pedido NUEVO por el portal; Comercial la ve; otro cliente no', async () => {
    const tag = uuid().slice(0, 8);
    const sofi = await sesion(['comercial']);
    const cli = async (n: string) => {
      const [c] = await admin`INSERT INTO cliente (codigo, nombre) VALUES (${'ZP' + n + tag}, ${'zz_test_cliP' + n + tag}) RETURNING id`;
      const acc = (await sofi('POST', '/api/portal-accesos', { clienteId: c.id, descripcion: 'Compras ' + n })).j;
      const llamar: Llamar = async (method, path, body) => {
        const res = await app.request(path, {
          method,
          headers: { origin: 'http://localhost:5173', authorization: `Portal ${acc.token}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        return { status: res.status, j: (await res.json().catch(() => ({}))) as Record<string, unknown> };
      };
      return llamar;
    };
    const a = await cli('A');
    const b = await cli('B');
    const pedido = (await a('POST', '/api/portal/pedidos', { descripcion: 'Cartel nuevo para el local', claveIdempotencia: uuid() })).j;
    // El tipo lo fija el portal: aunque mande otro, queda FOTO_PEDIDO.
    expect(await subirCompleto(a, '/api/portal/archivos', foto({ tipo: 'ODOMETRO_INICIO', pedidoId: pedido.id }))).toBe(200);
    expect(await subirCompleto(b, '/api/portal/archivos', foto({ pedidoId: pedido.id }))).toBe(404);
    expect((await b('GET', `/api/portal/archivos?pedidoId=${pedido.id}`)).status).toBe(404);
    expect(((await a('GET', `/api/portal/archivos?pedidoId=${pedido.id}`)).j as unknown as unknown[]).length).toBe(1);
    // Comercial la ve, pero no sube fotos "del cliente".
    const vista = (await sofi('GET', `/api/archivos?pedidoId=${pedido.id}`)).j as unknown as { subido_por: string }[];
    expect(vista[0].subido_por).toBe('Cliente');
    expect((await sofi('POST', '/api/archivos/solicitar', foto({ tipo: 'FOTO_PEDIDO', pedidoId: pedido.id }))).status).toBe(403);
    const bandeja = (await sofi('GET', '/api/pedidos?q=' + pedido.numero)).j as { items: { fotos: number }[] };
    expect(bandeja.items[0].fotos).toBe(1);
    expect((await sofi('POST', `/api/pedidos/${pedido.id}/convertir`, { a: 'OT' })).status).toBe(200);
    expect(await subirCompleto(a, '/api/portal/archivos', foto({ pedidoId: pedido.id }))).toBe(409);
  });
});
