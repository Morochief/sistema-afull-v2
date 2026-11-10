import { describe, it, expect, afterAll } from 'vitest';
import { admin, cerrarConexiones } from '../loop0/helpers.js';
import { crearUsuario, post } from '../loop0/auth-helpers.js';
import { app } from '../../apps/api/src/index.js';

const personas: string[] = [];
afterAll(async () => {
  await admin`UPDATE tarea_intervalo SET hora_fin = greatest(clock_timestamp(), hora_inicio), motivo_cierre = 'FIN'
              WHERE hora_fin IS NULL AND persona_id = ANY(${personas}::uuid[])`;
  await admin`UPDATE persona SET activo = false WHERE id = ANY(${personas}::uuid[])`;
  await cerrarConexiones();
});

const ORIGEN = process.env.APP_ORIGIN || 'http://localhost:3000';
const req = (method: string, path: string, cookie: string, body?: unknown) =>
  app.request(path, { method, headers: { origin: ORIGEN, cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });

/** Operario con persona y una OT con dos tareas suyas; otro operario con un tramo en la misma tarea. */
async function escenario() {
  const tag = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const nuevo = async (n: string) => {
    const u = await crearUsuario(['taller']);
    const [p] = await admin`INSERT INTO persona (nombre, ci) VALUES (${`zz_test_rel_${n}_${tag}`}, ${`R${n}${tag}`}) RETURNING id`;
    personas.push(p.id as string);
    await admin`UPDATE usuario SET persona_id = ${p.id} WHERE id = ${u.id}`;
    const res = await post('/api/auth/login', { username: u.username, password: 'Password123!' });
    return { personaId: p.id as string, cookie: res.headers.get('set-cookie')!.split(';')[0] };
  };
  const yo = await nuevo('a');
  const otro = await nuevo('b');
  const [c] = await admin`INSERT INTO cliente (codigo, nombre) VALUES (${'CR-' + tag}, ${'zz_test_cli_rel_' + tag}) RETURNING id`;
  const [jefe] = await admin`SELECT id FROM usuario WHERE activo = true LIMIT 1`;
  const [ot] = await admin`INSERT INTO orden_trabajo (codigo_ot, cliente_id, titulo, creado_por) VALUES (${'OTR-' + tag}, ${c.id}, ${'zz_test ' + tag}, ${jefe.id}) RETURNING id`;
  const tarea = async (n: number) => (await admin`
    INSERT INTO tarea (orden_trabajo_id, persona_asignada_id, tipo, descripcion, orden_secuencia, estado, creado_por)
    VALUES (${ot.id}, ${yo.personaId}, 'TALLER_IMPRESION', ${'zz_test tarea ' + n}, ${n}, 'PAUSADA', ${jefe.id}) RETURNING id`)[0].id as string;
  return { yo, otro, t1: await tarea(1), t2: await tarea(2) };
}
const tramo = (tareaId: string, personaId: string, ini: string, fin: string | null) => admin`
  INSERT INTO tarea_intervalo (tarea_id, persona_id, hora_inicio, hora_fin, motivo_cierre, clave_idempotencia)
  VALUES (${tareaId}, ${personaId}, ${ini}::timestamptz, ${fin}::timestamptz, ${fin ? 'PAUSA' : null}, gen_random_uuid())`;
const miTrabajo = async (cookie: string) =>
  ((await (await req('GET', '/api/mi-trabajo', cookie)).json()) as { tareas: { id: string; segundos_acumulados: number; intervalo_abierto: unknown }[] }).tareas;

describe('L2.E5 — el reloj de la tarea suma lo acumulado', () => {
  it('CA-2.20: suma exacta de los tramos cerrados de esa persona en esa tarea, de cualquier día', async () => {
    const e = await escenario();
    await tramo(e.t1, e.yo.personaId, '2026-01-05 08:00:00-03', '2026-01-05 08:10:00-03'); // 600 s, otro día
    await tramo(e.t1, e.yo.personaId, '2026-01-06 09:00:00-03', '2026-01-06 09:02:05-03'); // 125 s
    await tramo(e.t2, e.yo.personaId, '2026-01-06 10:00:00-03', '2026-01-06 10:00:40-03'); // 40 s, otra tarea
    await tramo(e.t1, e.otro.personaId, '2026-01-06 11:00:00-03', '2026-01-06 12:00:00-03'); // de otra persona
    const t = await miTrabajo(e.yo.cookie);
    expect(t.find((x) => x.id === e.t1)!.segundos_acumulados).toBe(725);
    expect(t.find((x) => x.id === e.t2)!.segundos_acumulados).toBe(40);
  });

  it('CA-2.21: al reanudar, lo acumulado no incluye el tramo abierto (lo suma el navegador)', async () => {
    const e = await escenario();
    await tramo(e.t1, e.yo.personaId, '2026-01-06 09:00:00-03', '2026-01-06 09:05:00-03');
    const r = await req('POST', `/api/mi-trabajo/tareas/${e.t1}/iniciar`, e.yo.cookie, { claveIdempotencia: crypto.randomUUID() });
    expect(r.status).toBe(201);
    const t = (await miTrabajo(e.yo.cookie)).find((x) => x.id === e.t1)!;
    expect(t.segundos_acumulados).toBe(300);
    expect(t.intervalo_abierto).not.toBeNull();
  });

  it('una tarea sin tramos acumula 0', async () => {
    const e = await escenario();
    expect((await miTrabajo(e.yo.cookie)).find((x) => x.id === e.t2)!.segundos_acumulados).toBe(0);
  });
});
