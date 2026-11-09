import { app } from '../../apps/api/src/index.js';
import { sesion, type Resp } from '../loop3/helpers-comercial.js';

/** Fecha de hoy en Asunción (AAAA-MM-DD), la misma regla que usa la API. */
export const hoyAsuncion = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(new Date());

export type Sesion = Awaited<ReturnType<typeof sesion>>;
type Llamada = (method: string, path: string, body?: unknown) => Promise<Resp>;

/** Llama y exige el status esperado; si no, falla con el cuerpo para entender por qué. */
export async function ok(llamar: Llamada, method: string, path: string, body?: unknown, esperado = [200, 201]) {
  const r = await llamar(method, path, body);
  if (!esperado.includes(r.status)) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(r.j)}`);
  // Respuestas de la API sin tipar a propósito: el test valida los campos que usa.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return r.j as Record<string, any>;
}

/** Cliente con un local, creados por la API como lo haría Sofi. */
export async function clienteConLocal(juan: Sesion, tag: string) {
  const c = await ok(juan, 'POST', '/api/clientes', { nombre: `zz_test_cli10_${tag}` });
  const s = await ok(juan, 'POST', `/api/clientes/${c.id}/sucursales`, { nombre: 'Local', gpsLat: -25.3, gpsLng: -57.6 });
  return { clienteId: c.id as string, sucursalId: s.id as string };
}

export const nuevaOT = (juan: Sesion, cli: { clienteId: string; sucursalId: string }, titulo: string, extra: Record<string, unknown> = {}) =>
  ok(juan, 'POST', '/api/comercial/ot', { clienteId: cli.clienteId, sucursalId: cli.sucursalId, titulo, ...extra });

/** Lleva una OT por la máquina de estados (cada paso exige el estado anterior). */
export async function llevarA(juan: Sesion, otId: string, camino: string[], comentario?: string) {
  for (let i = 1; i < camino.length; i++) {
    await ok(juan, 'POST', `/api/comercial/ot/${otId}/transicionar`, { desde: camino[i - 1], a: camino[i], comentario });
  }
}

/** Presupuesto de un ítem, enviado y aprobado: genera una OT con monto presupuestado. */
export async function otConVenta(juan: Sesion, cli: { clienteId: string; sucursalId: string }, tag: string, precio = 1_000_000) {
  const p = await ok(juan, 'POST', '/api/presupuestos', { clienteId: cli.clienteId, titulo: `zz_test pres ${tag}`, margenPct: 0 });
  await ok(juan, 'POST', `/api/presupuestos/${p.id}/items`, { sucursalId: cli.sucursalId, concepto: 'MATERIAL', descripcion: 'Lona', cantidad: 1, unidad: 'UNIDAD', precioUnitarioGs: precio });
  await ok(juan, 'POST', `/api/presupuestos/${p.id}/enviar`, { desde: 'BORRADOR' });
  const ap = await ok(juan, 'POST', `/api/presupuestos/${p.id}/aprobar`, { desde: 'ENVIADO', comentario: 'zz_test OC por mail' });
  return { otId: ap.ots[0].id as string, monto: Number(ap.ots[0].monto_presupuestado_gs) };
}

/** Pedido hecho por el cliente desde el portal (Authorization: Portal <token>). */
export async function pedidoPortal(token: string, descripcion: string) {
  const res = await app.request('/api/portal/pedidos', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Portal ${token}` },
    body: JSON.stringify({ descripcion, claveIdempotencia: crypto.randomUUID() }),
  });
  if (res.status !== 201) throw new Error(`pedido portal → ${res.status} ${await res.text()}`);
}

/** Persona activa vinculada a un usuario nuevo con las capacidades dadas (para cronómetro y cuadrilla). */
export async function operario(juan: Sesion, caps: string[], tag: string) {
  const s = await sesion(caps);
  const p = await ok(juan, 'POST', '/api/personas', { nombre: `zz_test_Op10 ${tag}`, ci: `Z10${tag}` });
  await ok(juan, 'PATCH', `/api/personas/${p.id}/usuario`, { usuarioId: s.usuarioId });
  return { s, personaId: p.id as string };
}

export { sesion };
