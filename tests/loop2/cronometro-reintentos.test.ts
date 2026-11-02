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

describe('L2.E2 (auditoría Claude Code) — reintentos y reasignación', () => {
  it('pausar y finalizar dos veces (reintento de red) responden 200 sin duplicar eventos', async () => {
    const { cookie, tarea } = await fixtureOperarioConTarea();
    const base = `/api/mi-trabajo/tareas/${tarea.id}`;
    expect((await req('POST', `${base}/iniciar`, cookie, { claveIdempotencia: crypto.randomUUID() })).status).toBe(201);

    const p1 = await req('POST', `${base}/pausar`, cookie, { motivo: 'PAUSA', claveIdempotencia: crypto.randomUUID() });
    const p2 = await req('POST', `${base}/pausar`, cookie, { motivo: 'PAUSA', claveIdempotencia: crypto.randomUUID() });
    expect(p1.status).toBe(200);
    expect(p2.status).toBe(200);

    const f1 = await req('POST', `${base}/finalizar`, cookie, { claveIdempotencia: crypto.randomUUID() });
    const f2 = await req('POST', `${base}/finalizar`, cookie, { claveIdempotencia: crypto.randomUUID() });
    expect(f1.status).toBe(200);
    expect(f2.status).toBe(200);

    const eventos = await admin`
      SELECT estado_nuevo FROM tarea_evento WHERE tarea_id = ${tarea.id} ORDER BY created_at, id
    `;
    expect(eventos.map((e) => e.estado_nuevo)).toEqual(['PENDIENTE', 'EN_CURSO', 'PAUSADA', 'LISTO']);
  });

  it('reasignar una tarea EN_CURSO a otra persona responde 409 y no deja el intervalo huérfano', async () => {
    const { cookie, tarea } = await fixtureOperarioConTarea();
    const otro = await fixtureOperarioConTarea();
    expect(
      (await req('POST', `/api/mi-trabajo/tareas/${tarea.id}/iniciar`, cookie, { claveIdempotencia: crypto.randomUUID() }))
        .status,
    ).toBe(201);

    const { cookie: cookieComercial } = await sesionUsuario(['comercial']);
    const [t] = await admin`SELECT updated_at FROM tarea WHERE id = ${tarea.id}`;
    const res = await req('PATCH', `/api/tareas/${tarea.id}`, cookieComercial, {
      personaAsignadaId: otro.persona.id,
      updatedAt: (t.updated_at as Date).toISOString(),
    });
    expect(res.status).toBe(409);

    const [despues] = await admin`SELECT persona_asignada_id, estado FROM tarea WHERE id = ${tarea.id}`;
    expect(despues.estado).toBe('EN_CURSO');
    expect(despues.persona_asignada_id).not.toBe(otro.persona.id);
  });
});
