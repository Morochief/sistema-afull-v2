import { describe, it, expect, afterAll } from 'vitest';
import { admin, cerrarConexiones } from '../loop0/helpers.js';
import { crearUsuario, post } from '../loop0/auth-helpers.js';
import { app } from '../../apps/api/src/index.js';

/** Loop 12 — horas de máquina compartidas (docs/LOOP_12_HORAS_COMPARTIDAS_DISENO.md). */
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
const login = async (caps: string[]) => {
  const u = await crearUsuario(caps);
  const res = await post('/api/auth/login', { username: u.username, password: 'Password123!' });
  return { id: u.id as string, cookie: res.headers.get('set-cookie')!.split(';')[0] };
};
const clave = () => crypto.randomUUID();

/** Edu con tarifa 21.000 Gs/h y tres OTs de clientes distintos, cada una con una impresión suya. */
async function escenario() {
  const tag = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const edu = await login(['taller']);
  const [p] = await admin`INSERT INTO persona (nombre, ci) VALUES (${'zz_test_tanda_' + tag}, ${'T12' + tag}) RETURNING id`;
  personas.push(p.id as string);
  await admin`UPDATE usuario SET persona_id = ${p.id} WHERE id = ${edu.id}`;
  await admin`INSERT INTO tarifa_persona (persona_id, tarifa_hora_gs, fecha_inicio) VALUES (${p.id}, 21000, '2026-01-01')`;
  const ot = async (k: string, tipo = 'TALLER_IMPRESION', hoja = 'ACTIVA') => {
    const [c] = await admin`INSERT INTO cliente (codigo, nombre) VALUES (${`C12${k}-${tag}`}, ${`zz_test_cli12_${k}_${tag}`}) RETURNING id`;
    const [o] = await admin`INSERT INTO orden_trabajo (codigo_ot, cliente_id, titulo, creado_por, hoja_estado)
                           VALUES (${`OT12${k}-${tag}`}, ${c.id}, ${'zz_test ' + k}, ${edu.id}, ${hoja}) RETURNING id`;
    const [t] = await admin`INSERT INTO tarea (orden_trabajo_id, persona_asignada_id, tipo, descripcion, orden_secuencia, estado, creado_por)
                           VALUES (${o.id}, ${p.id}, ${tipo}, ${'zz_test imprimir ' + k}, 1, 'PENDIENTE', ${edu.id}) RETURNING id`;
    return { otId: o.id as string, tareaId: t.id as string };
  };
  return { edu, personaId: p.id as string, a: await ot('A'), b: await ot('B'), c: await ot('C'), ot };
}
const tanda = (cookie: string, tareas: { tareaId: string; m2Piezas: number }[]) =>
  req('POST', '/api/mi-trabajo/tanda', cookie, { tareas, claveIdempotencia: clave() });
const estados = async (...ids: string[]) =>
  (await admin`SELECT id, estado FROM tarea WHERE id = ANY(${ids}::uuid[])`).reduce((m, r) => ({ ...m, [r.id]: r.estado }), {} as Record<string, string>);

describe('Loop 12 — tanda compartida', () => {
  it('CA-12.1: 1 h de tanda (2 y 1,5 m²) reparte la mano de obra 2/3,5 y 1,5/3,5', async () => {
    const e = await escenario();
    const r = await tanda(e.edu.cookie, [{ tareaId: e.a.tareaId, m2Piezas: 2 }, { tareaId: e.b.tareaId, m2Piezas: 1.5 }]);
    expect(r.status).toBe(201);
    const { tandaId } = (await r.json()) as { tandaId: string };
    // Se cierra el tramo abierto y se agrega una hora exacta de la misma tanda (ayer).
    await req('POST', `/api/mi-trabajo/tareas/${e.a.tareaId}/pausar`, e.edu.cookie, { motivo: 'PAUSA', claveIdempotencia: clave() });
    await admin`INSERT INTO tarea_intervalo (tarea_id, persona_id, hora_inicio, hora_fin, motivo_cierre, clave_idempotencia, tanda_id)
                VALUES (${e.a.tareaId}, ${e.personaId}, '2026-11-09 08:00-03', '2026-11-09 09:00-03', 'PAUSA', gen_random_uuid(), ${tandaId})`;
    const jefe = await login(['admin']);
    const costo = async (otId: string) => (await (await req('GET', `/api/costeo/ot/${otId}`, jefe.cookie)).json()) as { horas: number; mano_obra_gs: number };
    const [ca, cb] = [await costo(e.a.otId), await costo(e.b.otId)];
    // 21.000 × 2/3,5 = 12.000 y 21.000 × 1,5/3,5 = 9.000 (+ los pocos ms del tramo pausado, que redondean a 0).
    expect(ca.mano_obra_gs).toBe(12000);
    expect(cb.mano_obra_gs).toBe(9000);
    expect(ca.horas).toBeCloseTo(0.57, 2);
    expect(cb.horas).toBeCloseTo(0.43, 2);
  });

  it('CA-12.2: un tramo normal sigue cargando 100 % a su OT', async () => {
    const e = await escenario();
    await admin`INSERT INTO tarea_intervalo (tarea_id, persona_id, hora_inicio, hora_fin, motivo_cierre, clave_idempotencia)
                VALUES (${e.c.tareaId}, ${e.personaId}, '2026-11-09 08:00-03', '2026-11-09 09:00-03', 'PAUSA', gen_random_uuid())`;
    const jefe = await login(['admin']);
    const c = (await (await req('GET', `/api/costeo/ot/${e.c.otId}`, jefe.cookie)).json()) as { mano_obra_gs: number };
    expect(c.mano_obra_gs).toBe(21000);
  });

  it('CA-12.3 y 12.4: pausar, reanudar y finalizar mueven todas las tareas de la tanda; Mi trabajo muestra una sola tarjeta', async () => {
    const e = await escenario();
    const { tandaId } = (await (await tanda(e.edu.cookie, [{ tareaId: e.a.tareaId, m2Piezas: 2 }, { tareaId: e.b.tareaId, m2Piezas: 1 }])).json()) as { tandaId: string };
    expect(await estados(e.a.tareaId, e.b.tareaId)).toEqual({ [e.a.tareaId]: 'EN_CURSO', [e.b.tareaId]: 'EN_CURSO' });
    const mt = (await (await req('GET', '/api/mi-trabajo', e.edu.cookie)).json()) as { tareas: { id: string; tanda: { tareas: { m2: number }[] } | null }[] };
    expect(mt.tareas.some((t) => t.id === e.b.tareaId)).toBe(false);
    expect(mt.tareas.find((t) => t.id === e.a.tareaId)!.tanda!.tareas.map((x) => x.m2)).toEqual([2, 1]);

    expect((await req('POST', `/api/mi-trabajo/tareas/${e.a.tareaId}/pausar`, e.edu.cookie, { motivo: 'PAUSA', claveIdempotencia: clave() })).status).toBe(200);
    expect(await estados(e.a.tareaId, e.b.tareaId)).toEqual({ [e.a.tareaId]: 'PAUSADA', [e.b.tareaId]: 'PAUSADA' });
    expect((await req('POST', `/api/mi-trabajo/tareas/${e.a.tareaId}/iniciar`, e.edu.cookie, { claveIdempotencia: clave() })).status).toBe(201);
    const tramos = await admin`SELECT tanda_id FROM tarea_intervalo WHERE tarea_id = ${e.a.tareaId}`;
    expect(tramos.length).toBe(2);
    expect(tramos.every((t) => t.tanda_id === tandaId)).toBe(true);
    // La tarea B se opera solo desde la tarjeta de la tanda.
    expect((await req('POST', `/api/mi-trabajo/tareas/${e.b.tareaId}/pausar`, e.edu.cookie, { motivo: 'PAUSA', claveIdempotencia: clave() })).status).toBe(409);

    expect((await req('POST', `/api/mi-trabajo/tareas/${e.a.tareaId}/finalizar`, e.edu.cookie, { claveIdempotencia: clave() })).status).toBe(200);
    expect(await estados(e.a.tareaId, e.b.tareaId)).toEqual({ [e.a.tareaId]: 'LISTO', [e.b.tareaId]: 'LISTO' });
  });

  it('iniciar otra tarea con la tanda en marcha pausa toda la tanda', async () => {
    const e = await escenario();
    await tanda(e.edu.cookie, [{ tareaId: e.a.tareaId, m2Piezas: 2 }, { tareaId: e.b.tareaId, m2Piezas: 1 }]);
    expect((await req('POST', `/api/mi-trabajo/tareas/${e.c.tareaId}/iniciar`, e.edu.cookie, { claveIdempotencia: clave() })).status).toBe(201);
    expect(await estados(e.a.tareaId, e.b.tareaId, e.c.tareaId)).toEqual({ [e.a.tareaId]: 'PAUSADA', [e.b.tareaId]: 'PAUSADA', [e.c.tareaId]: 'EN_CURSO' });
  });

  it('CA-12.5: rechazos', async () => {
    const e = await escenario();
    const otra = await escenario();
    const borrador = await e.ot('D', 'TALLER_IMPRESION', 'BORRADOR');
    const montaje = await e.ot('E', 'MONTAJE_CALLE');
    expect((await tanda(e.edu.cookie, [{ tareaId: e.a.tareaId, m2Piezas: 2 }])).status).toBe(400);
    expect((await tanda(e.edu.cookie, [{ tareaId: e.a.tareaId, m2Piezas: 2 }, { tareaId: otra.a.tareaId, m2Piezas: 1 }])).status).toBe(403);
    expect((await tanda(e.edu.cookie, [{ tareaId: e.a.tareaId, m2Piezas: 2 }, { tareaId: montaje.tareaId, m2Piezas: 1 }])).status).toBe(400);
    expect((await tanda(e.edu.cookie, [{ tareaId: e.a.tareaId, m2Piezas: 2 }, { tareaId: e.b.tareaId, m2Piezas: 0 }])).status).toBe(400);
    expect((await tanda(e.edu.cookie, [{ tareaId: e.a.tareaId, m2Piezas: 2 }, { tareaId: borrador.tareaId, m2Piezas: 1 }])).status).toBe(409);
    // Dos tareas de la misma OT.
    const [t2] = await admin`INSERT INTO tarea (orden_trabajo_id, persona_asignada_id, tipo, descripcion, orden_secuencia, estado, creado_por)
                             VALUES (${e.a.otId}, ${e.personaId}, 'PLOTEO', 'zz_test plotear', 2, 'PENDIENTE', ${e.edu.id}) RETURNING id`;
    expect((await tanda(e.edu.cookie, [{ tareaId: e.a.tareaId, m2Piezas: 2 }, { tareaId: t2.id as string, m2Piezas: 1 }])).status).toBe(400);
    // Una tarea que ya está en una tanda abierta.
    expect((await tanda(e.edu.cookie, [{ tareaId: e.a.tareaId, m2Piezas: 2 }, { tareaId: e.b.tareaId, m2Piezas: 1 }])).status).toBe(201);
    expect((await tanda(e.edu.cookie, [{ tareaId: e.c.tareaId, m2Piezas: 2 }, { tareaId: e.b.tareaId, m2Piezas: 1 }])).status).toBe(409);
  });

  it('CA-12.6: tanda, tanda_tarea y el tanda_id del tramo son inmutables', async () => {
    const e = await escenario();
    const { tandaId } = (await (await tanda(e.edu.cookie, [{ tareaId: e.a.tareaId, m2Piezas: 2 }, { tareaId: e.b.tareaId, m2Piezas: 1 }])).json()) as { tandaId: string };
    await expect(admin`UPDATE tanda_tarea SET m2_piezas = 5 WHERE tanda_id = ${tandaId}`).rejects.toThrow();
    await expect(admin`DELETE FROM tanda_tarea WHERE tanda_id = ${tandaId}`).rejects.toThrow();
    await expect(admin`DELETE FROM tanda WHERE id = ${tandaId}`).rejects.toThrow();
    await expect(admin`UPDATE tarea_intervalo SET tanda_id = NULL, hora_fin = clock_timestamp() WHERE tanda_id = ${tandaId} AND hora_fin IS NULL`).rejects.toThrow();
  });

  it('la oficina no puede cancelar ni reasignar una tarea de una tanda abierta', async () => {
    const e = await escenario();
    await tanda(e.edu.cookie, [{ tareaId: e.a.tareaId, m2Piezas: 2 }, { tareaId: e.b.tareaId, m2Piezas: 1 }]);
    await req('POST', `/api/mi-trabajo/tareas/${e.a.tareaId}/pausar`, e.edu.cookie, { motivo: 'PAUSA', claveIdempotencia: clave() });
    const jefe = await login(['admin']);
    const desde = (await estados(e.b.tareaId))[e.b.tareaId];
    const r = await req('POST', `/api/tareas/${e.b.tareaId}/cancelar`, jefe.cookie, { desde, comentario: 'zz_test' });
    expect(r.status).toBe(409);
  });
});
