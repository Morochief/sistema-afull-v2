import { admin } from '../loop0/helpers.js';
import { crearUsuario, post } from '../loop0/auth-helpers.js';
import { app } from '../../apps/api/src/index.js';

// Ayudantes compartidos por las pruebas HTTP del circuito comercial (Loop 3).
const ORIGEN = process.env.APP_ORIGIN || 'http://localhost:3000';
export type Resp = { status: number; j: Record<string, unknown> };

export async function sesion(caps: string[]) {
  const u = await crearUsuario(caps);
  const r = await post('/api/auth/login', { username: u.username, password: 'Password123!' });
  const cookie = r.headers.get('set-cookie')!.split(';')[0];
  const llamar = async (method: string, path: string, body?: unknown): Promise<Resp> => {
    const res = await app.request(path, {
      method,
      headers: { origin: ORIGEN, cookie, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, j: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  };
  return Object.assign(llamar, { usuarioId: u.id });
}

export async function cliente(nombre?: string) {
  const tag = crypto.randomUUID().slice(0, 8);
  const [c] = await admin`
    INSERT INTO cliente (codigo, nombre) VALUES (${'ZZ-' + tag}, ${nombre ?? 'zz_test_cli_' + tag}) RETURNING id
  `;
  const [s] = await admin`INSERT INTO sucursal (cliente_id, nombre, gps_lat, gps_lng) VALUES (${c.id}, ${'Local ' + tag}, -25.3, -57.6) RETURNING id`;
  return { id: c.id as string, sucursal: s.id as string };
}

export const item = (extra: Record<string, unknown> = {}) => ({
  concepto: 'MATERIAL', descripcion: 'Lona front', cantidad: 1, precioUnitarioGs: 170, ...extra,
});

export async function otraSucursal(clienteId: string, nombre: string) {
  const [s] = await admin`
    INSERT INTO sucursal (cliente_id, nombre, gps_lat, gps_lng) VALUES (${clienteId}, ${nombre}, -25.3, -57.6) RETURNING id
  `;
  return s.id as string;
}

type Api = Awaited<ReturnType<typeof sesion>>;

/** Crea un presupuesto con los ítems dados y lo deja ENVIADO. */
export async function presupuestoEnviado(api: Api, clienteId: string, items: Record<string, unknown>[], margenPct = 35) {
  const p = (await api('POST', '/api/presupuestos', { clienteId, titulo: 'zz_test campaña', margenPct })).j;
  for (const i of items) await api('POST', `/api/presupuestos/${p.id}/items`, item(i));
  const e = await api('POST', `/api/presupuestos/${p.id}/enviar`, { desde: 'BORRADOR' });
  if (e.status !== 200) throw new Error('No se pudo enviar: ' + JSON.stringify(e.j));
  return { id: p.id as string, total: e.j.total_gs as number };
}
