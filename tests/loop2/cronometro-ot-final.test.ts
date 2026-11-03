import { describe, it, expect, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { admin, cerrarConexiones } from '../loop0/helpers.js';
import { crearUsuario, post } from '../loop0/auth-helpers.js';
import { app } from '../../apps/api/src/index.js';

const personasCreadas = new Set<string>();

afterAll(async () => {
  if (personasCreadas.size > 0) {
    const ids = [...personasCreadas];
    await admin`
      UPDATE tarea_intervalo
      SET hora_fin = greatest(clock_timestamp(), hora_inicio), motivo_cierre = 'FIN'
      WHERE hora_fin IS NULL AND persona_id = ANY(${ids}::uuid[])
    `;
    await admin`UPDATE persona SET activo = false WHERE id = ANY(${ids}::uuid[])`;
  }
  await cerrarConexiones();
});

const ORIGEN = process.env.APP_ORIGIN || 'http://localhost:3000';

function req(method: string, path: string, cookie?: string, body?: unknown) {
  const headers: Record<string, string> = { origin: ORIGEN };
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return app.request(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
}

async function sesionUsuario(capacidades: string[]) {
  const u = await crearUsuario(capacidades);
  const res = await post('/api/auth/login', { username: u.username, password: 'Password123!' });
  const cookie = res.headers.get('set-cookie')!.split(';')[0];
  return { u, cookie };
}

async function fixtureOperarioConTarea() {
  const { u, cookie } = await sesionUsuario(['taller', 'montaje']);
  const tag = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const [p] = await admin`
    INSERT INTO persona (nombre, ci) VALUES (${'zz_test_op_' + tag}, ${'CI-' + tag}) RETURNING id, nombre
  `;
  personasCreadas.add(p.id as string);
  await admin`UPDATE usuario SET persona_id = ${p.id} WHERE id = ${u.id}`;

  const [adminUser] = await admin`SELECT id FROM usuario WHERE activo = true LIMIT 1`;
  const [cliente] = await admin`
    INSERT INTO cliente (codigo, nombre) VALUES (${'CL-' + tag}, ${'zz_test_cli_' + tag}) RETURNING id, nombre
  `;
  const [ot] = await admin`
    INSERT INTO orden_trabajo (codigo_ot, cliente_id, titulo, creado_por)
    VALUES (${'OT-' + tag}, ${cliente.id}, ${'OT ' + tag}, ${adminUser.id})
    RETURNING id, codigo_ot, titulo
  `;
  const [tarea] = await admin`
    INSERT INTO tarea (orden_trabajo_id, persona_asignada_id, tipo, descripcion, orden_secuencia, estado, creado_por)
    VALUES (${ot.id}, ${p.id}, 'TALLER_CORTE', ${'Corte acrílico ' + tag}, 1, 'PENDIENTE', ${adminUser.id})
    RETURNING id, estado
  `;
  await admin`
    INSERT INTO tarea_evento (tarea_id, estado_anterior, estado_nuevo, autor_id)
    VALUES (${tarea.id}, NULL, 'PENDIENTE', ${adminUser.id})
  `;
  return { persona: p, usuario: u, cookie, cliente, ot, tarea };
}

describe('L2.E4 (auditoría Claude Code) — cronómetro y estados finales', () => {
  it('terminar o cancelar una OT con una tarea EN_CURSO responde 409 y no deja el intervalo corriendo', async () => {
    const { cookie, tarea, ot } = await fixtureOperarioConTarea();
    const { cookie: com } = await sesionUsuario(['comercial']);
    const base = `/api/mi-trabajo/tareas/${tarea.id}`;
    expect((await req('POST', `${base}/iniciar`, cookie, { claveIdempotencia: crypto.randomUUID() })).status).toBe(201);
    const t = `/api/comercial/ot/${ot.id}/transicionar`;
    expect((await req('POST', t, com, { desde: 'PENDIENTE', a: 'EN_TALLER' })).status).toBe(200);

    const term = await req('POST', t, com, { desde: 'EN_TALLER', a: 'TERMINADO' });
    expect(term.status).toBe(409);
    expect(((await term.json()) as { error: string }).error).toMatch(/en curso/);
    const canc = await req('POST', t, com, { desde: 'EN_TALLER', a: 'CANCELADO', comentario: 'cliente desistió' });
    expect(canc.status).toBe(409);

    // Pausada, la OT ya se puede cerrar.
    expect((await req('POST', `${base}/pausar`, cookie, { motivo: 'PAUSA', claveIdempotencia: crypto.randomUUID() })).status).toBe(200);
    expect((await req('POST', t, com, { desde: 'EN_TALLER', a: 'TERMINADO' })).status).toBe(200);
  });

  it('no se puede iniciar una tarea de una OT terminada, y deja de aparecer en Mi trabajo', async () => {
    const { cookie, tarea, ot } = await fixtureOperarioConTarea();
    await admin`UPDATE orden_trabajo SET estado = 'CANCELADO' WHERE id = ${ot.id}`;
    const r = await req('POST', `/api/mi-trabajo/tareas/${tarea.id}/iniciar`, cookie, { claveIdempotencia: crypto.randomUUID() });
    expect(r.status).toBe(409);
    const [{ n }] = await admin`SELECT count(*)::int AS n FROM tarea_intervalo WHERE tarea_id = ${tarea.id}`;
    expect(n).toBe(0);
    const mt = (await (await req('GET', '/api/mi-trabajo', cookie)).json()) as { tareas: { id: string }[] };
    expect(mt.tareas.map((x) => x.id)).not.toContain(tarea.id);
  });

  it('desactivar una persona con el cronómetro abierto responde 409', async () => {
    const { cookie, tarea, persona } = await fixtureOperarioConTarea();
    const { cookie: adm } = await sesionUsuario(['admin']);
    expect((await req('POST', `/api/mi-trabajo/tareas/${tarea.id}/iniciar`, cookie, { claveIdempotencia: crypto.randomUUID() })).status).toBe(201);
    const [p] = await admin`SELECT updated_at FROM persona WHERE id = ${persona.id}`;
    const r = await req('PATCH', `/api/personas/${persona.id}/estado`, adm, { activo: false, updatedAt: new Date(p.updated_at).toISOString() });
    expect(r.status).toBe(409);
    const [q] = await admin`SELECT activo FROM persona WHERE id = ${persona.id}`;
    expect(q.activo).toBe(true);
  });
});
