import { describe, it, expect, afterAll } from 'vitest';
import { admin, cerrarConexiones } from '../loop0/helpers.js';
import { crearUsuario, post } from '../loop0/auth-helpers.js';
import { app } from '../../apps/api/src/index.js';

afterAll(cerrarConexiones);

const ORIGEN = process.env.APP_ORIGIN || 'http://localhost:3000';

async function sesionOperario(capacidades: string[] = ['taller']) {
  const u = await crearUsuario(capacidades);
  const tag = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const [p] = await admin`
    INSERT INTO persona (nombre, ci) VALUES (${'zz_op_' + tag}, ${'CI-' + tag}) RETURNING id, nombre
  `;
  await admin`UPDATE usuario SET persona_id = ${p.id} WHERE id = ${u.id}`;
  const res = await post('/api/auth/login', { username: u.username, password: 'Password123!' });
  const cookie = res.headers.get('set-cookie')!.split(';')[0];
  return { u, persona: p, cookie };
}

function req(method: string, path: string, cookie?: string, body?: unknown) {
  const headers: Record<string, string> = { origin: ORIGEN };
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return app.request(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
}

async function fixtureOTyTareas(personaId: string, cantidad = 3) {
  const tag = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const [cliente] = await admin`
    INSERT INTO cliente (codigo, nombre) VALUES (${'CL-' + tag}, ${'zz_cli_' + tag}) RETURNING id
  `;
  const [adminUser] = await admin`SELECT id FROM usuario WHERE activo = true LIMIT 1`;
  const [ot] = await admin`
    INSERT INTO orden_trabajo (codigo_ot, cliente_id, titulo, creado_por)
    VALUES (${'OT-' + tag}, ${cliente.id}, ${'OT ' + tag}, ${adminUser.id})
    RETURNING id
  `;
  const tareas = [];
  for (let i = 0; i < cantidad; i++) {
    const [t] = await admin`
      INSERT INTO tarea (orden_trabajo_id, persona_asignada_id, tipo, descripcion, orden_secuencia, estado, creado_por)
      VALUES (${ot.id}, ${personaId}, 'TALLER_CORTE', ${'Tarea ' + (i + 1) + ' ' + tag}, ${i + 1}, 'PENDIENTE', ${adminUser.id})
      RETURNING id, orden_trabajo_id, persona_asignada_id, tipo, descripcion, estado
    `;
    await admin`
      INSERT INTO tarea_evento (tarea_id, estado_anterior, estado_nuevo, autor_id)
      VALUES (${t.id}, NULL, 'PENDIENTE', ${adminUser.id})
    `;
    tareas.push(t);
  }
  return { cliente, ot, tareas };
}

describe('L2.E2 — Cronómetro y Mi Trabajo (CA-0.3, CA-2.1, CA-2.2, CA-2.3, CA-2.5)', () => {
  it('CA-2.1 Idempotencia: la misma clave devuelve 200 con el mismo id de intervalo', async () => {
    const { persona, cookie } = await sesionOperario();
    const { tareas } = await fixtureOTyTareas(persona.id, 1);
    const clave = crypto.randomUUID();

    const r1 = await req('POST', `/api/mi-trabajo/tareas/${tareas[0].id}/iniciar`, cookie, { claveIdempotencia: clave });
    expect(r1.status).toBe(201);
    const body1 = await r1.json();
    expect(body1.esIdempotente).toBe(false);
    expect(body1.intervaloId).toBeDefined();

    const r2 = await req('POST', `/api/mi-trabajo/tareas/${tareas[0].id}/iniciar`, cookie, { claveIdempotencia: clave });
    expect(r2.status).toBe(200);
    const body2 = await r2.json();
    expect(body2.esIdempotente).toBe(true);
    expect(body2.intervaloId).toBe(body1.intervaloId);
  });

  it('CA-2.2 Auto-pausa atómica: iniciar tarea B teniendo A en curso pausa A con CAMBIO_TAREA y deja B en curso', async () => {
    const { persona, cookie } = await sesionOperario();
    const { tareas } = await fixtureOTyTareas(persona.id, 2);

    // 1. Iniciar tarea A
    const resA = await req('POST', `/api/mi-trabajo/tareas/${tareas[0].id}/iniciar`, cookie, {
      claveIdempotencia: crypto.randomUUID(),
    });
    expect(resA.status).toBe(201);

    // Invariante de diseño: tarea A en curso <=> 1 intervalo abierto
    const [tA1] = await admin`SELECT estado FROM tarea WHERE id = ${tareas[0].id}`;
    expect(tA1.estado).toBe('EN_CURSO');
    const [intA] = await admin`SELECT hora_fin FROM tarea_intervalo WHERE tarea_id = ${tareas[0].id}`;
    expect(intA.hora_fin).toBeNull();

    // 2. Iniciar tarea B -> debe pausar A automáticamente
    const resB = await req('POST', `/api/mi-trabajo/tareas/${tareas[1].id}/iniciar`, cookie, {
      claveIdempotencia: crypto.randomUUID(),
    });
    expect(resB.status).toBe(201);
    const bodyB = await resB.json();
    expect(bodyB.autoPausadaTareaId).toBe(tareas[0].id);

    // 3. Verificar estado en base: A está PAUSADA y B está EN_CURSO
    const [tA2] = await admin`SELECT estado FROM tarea WHERE id = ${tareas[0].id}`;
    expect(tA2.estado).toBe('PAUSADA');
    const [intACerrado] = await admin`SELECT hora_fin, motivo_cierre FROM tarea_intervalo WHERE tarea_id = ${tareas[0].id}`;
    expect(intACerrado.hora_fin).not.toBeNull();
    expect(intACerrado.motivo_cierre).toBe('CAMBIO_TAREA');

    const [tB] = await admin`SELECT estado FROM tarea WHERE id = ${tareas[1].id}`;
    expect(tB.estado).toBe('EN_CURSO');
    const [intB] = await admin`SELECT hora_fin FROM tarea_intervalo WHERE tarea_id = ${tareas[1].id}`;
    expect(intB.hora_fin).toBeNull();

    // 4. GET /api/mi-trabajo refleja servidor_ahora, tarea en curso y minutos
    const resMiTrabajo = await req('GET', '/api/mi-trabajo', cookie);
    expect(resMiTrabajo.status).toBe(200);
    const miTrabajo = await resMiTrabajo.json();
    expect(miTrabajo.servidor_ahora).toBeDefined();
    expect(miTrabajo.intervalo_abierto_actual?.tarea_id).toBe(tareas[1].id);
    expect(miTrabajo.tareas.length).toBeGreaterThanOrEqual(2);

    // 5. Pausar y finalizar
    const resPausar = await req('POST', `/api/mi-trabajo/tareas/${tareas[1].id}/pausar`, cookie, {
      motivo: 'ALMUERZO',
      claveIdempotencia: crypto.randomUUID(),
    });
    expect(resPausar.status).toBe(200);

    const resFinalizar = await req('POST', `/api/mi-trabajo/tareas/${tareas[1].id}/finalizar`, cookie, {
      comentario: 'Terminado trabajo de corte',
      claveIdempotencia: crypto.randomUUID(),
    });
    expect(resFinalizar.status).toBe(200);
    const [tBFin] = await admin`SELECT estado FROM tarea WHERE id = ${tareas[1].id}`;
    expect(tBFin.estado).toBe('LISTO');
  });

  it('CA-0.3 Concurrencia de 10 inicios simultáneos y rechazo SQL 23505', async () => {
    const { persona, cookie } = await sesionOperario();
    const { tareas } = await fixtureOTyTareas(persona.id, 10);

    // 10 inicios simultáneos con distintas tareas y claves
    const promesas = tareas.map((t) =>
      req('POST', `/api/mi-trabajo/tareas/${t.id}/iniciar`, cookie, {
        claveIdempotencia: crypto.randomUUID(),
      })
    );
    const respuestas = await Promise.all(promesas);

    // Ninguna respuesta es 500. Todas son 201, 200 o 409
    for (const r of respuestas) {
      expect([200, 201, 409]).toContain(r.status);
    }

    // Exactamente 1 intervalo abierto en base de datos para esta persona
    const [{ abiertos }] = await admin`
      SELECT count(*)::int AS abiertos FROM tarea_intervalo WHERE persona_id = ${persona.id} AND hora_fin IS NULL
    `;
    expect(abiertos).toBe(1);

    // Verificación de la restricción dura uq_intervalo_abierto en Postgres (23505)
    let errorPg = '';
    try {
      await admin`
        INSERT INTO tarea_intervalo (tarea_id, persona_id, hora_inicio, clave_idempotencia)
        VALUES (${tareas[0].id}, ${persona.id}, now(), ${crypto.randomUUID()})
      `;
    } catch (e: unknown) {
      errorPg = (e as { code?: string }).code ?? '';
    }
    expect(errorPg).toBe('23505');
  });

  it('CA-2.3 Inmutabilidad de intervalos cerrados y eventos de tarea', async () => {
    const { persona, cookie } = await sesionOperario();
    const { tareas } = await fixtureOTyTareas(persona.id, 1);

    // Iniciar y cerrar intervalo
    await req('POST', `/api/mi-trabajo/tareas/${tareas[0].id}/iniciar`, cookie, { claveIdempotencia: crypto.randomUUID() });
    await req('POST', `/api/mi-trabajo/tareas/${tareas[0].id}/pausar`, cookie, {
      motivo: 'PAUSA',
      claveIdempotencia: crypto.randomUUID(),
    });

    const [intervalo] = await admin`SELECT id FROM tarea_intervalo WHERE tarea_id = ${tareas[0].id}`;

    // Intento directo de modificar un intervalo cerrado -> bloqueado por trigger
    let errModif = '';
    try {
      await admin`UPDATE tarea_intervalo SET motivo_cierre = 'OTRO' WHERE id = ${intervalo.id}`;
    } catch (e: unknown) {
      errModif = (e as { code?: string }).code ?? '';
    }
    expect(errModif).toBe('23514');

    // Intento directo de borrar un intervalo -> bloqueado por trigger inmutable
    let errBorrar = '';
    try {
      await admin`DELETE FROM tarea_intervalo WHERE id = ${intervalo.id}`;
    } catch (e: unknown) {
      errBorrar = (e as { code?: string }).code ?? '';
    }
    expect(errBorrar).toBe('P0001');

    // Intento directo de borrar un evento -> bloqueado por trigger inmutable
    const [evento] = await admin`SELECT id FROM tarea_evento WHERE tarea_id = ${tareas[0].id} LIMIT 1`;
    let errBorrarEv = '';
    try {
      await admin`DELETE FROM tarea_evento WHERE id = ${evento.id}`;
    } catch (e: unknown) {
      errBorrarEv = (e as { code?: string }).code ?? '';
    }
    expect(errBorrarEv).toBe('P0001');
  });

  it('CA-2.5 Permisos: operario ajeno (403), usuario sin persona (403) y 401 sin sesión', async () => {
    const op1 = await sesionOperario();
    const op2 = await sesionOperario();
    const { tareas } = await fixtureOTyTareas(op1.persona.id, 1);

    // Op2 intenta operar tarea de Op1 -> 403
    const resAjeno = await req('POST', `/api/mi-trabajo/tareas/${tareas[0].id}/iniciar`, op2.cookie, {
      claveIdempotencia: crypto.randomUUID(),
    });
    expect(resAjeno.status).toBe(403);

    // Usuario sin persona vinculada -> 403
    const { cookie: cookieSinPersona } = await (async () => {
      const u = await crearUsuario(['taller']);
      const res = await post('/api/auth/login', { username: u.username, password: 'Password123!' });
      return { cookie: res.headers.get('set-cookie')!.split(';')[0] };
    })();
    const resSinPersona = await req('GET', '/api/mi-trabajo', cookieSinPersona);
    expect(resSinPersona.status).toBe(403);

    // 401 sin sesión en todas las rutas nuevas
    const rutasNuevas = [
      { method: 'GET', path: '/api/mi-trabajo' },
      { method: 'POST', path: `/api/mi-trabajo/tareas/${tareas[0].id}/iniciar` },
      { method: 'PATCH', path: `/api/tareas/${tareas[0].id}` },
    ];
    for (const r of rutasNuevas) {
      const resSinSesion = await req(r.method, r.path, undefined, r.method === 'GET' ? undefined : {});
      expect(resSinSesion.status).toBe(401);
    }
  });
});
