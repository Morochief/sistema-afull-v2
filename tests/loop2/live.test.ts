import { describe, it, expect, vi, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { admin, cerrarConexiones } from '../loop0/helpers.js';
import { crearUsuario, post } from '../loop0/auth-helpers.js';
import { app } from '../../apps/api/src/index.js';
import { CLAVES_LIVE_ESTADO_RESPUESTA, CLAVES_LIVE_PERSONA_ITEM, type LiveEstadoRespuesta } from '../../packages/shared/src/index.js';

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

describe('L2.E3 — Control en Vivo y Módulo Live (CA-2.5, CA-2.6)', () => {
  it('CA-2.5 Permisos: /api/live/estado exige sesión (401) y capacidad comercial (403)', async () => {
    const resSinSesion = await req('GET', '/api/live/estado');
    expect(resSinSesion.status).toBe(401);

    const { cookie: cookieTaller } = await sesionUsuario(['taller']);
    const resSinComercial = await req('GET', '/api/live/estado', cookieTaller);
    expect(resSinComercial.status).toBe(403);

    const { cookie: cookieComercial } = await sesionUsuario(['comercial']);
    const resComercial = await req('GET', '/api/live/estado', cookieComercial);
    expect(resComercial.status).toBe(200);
  });

  it('GET /api/live/estado refleja en tiempo real el inicio y pausa de tareas', async () => {
    const { cookie: cookieComercial } = await sesionUsuario(['comercial']);
    const { persona, cookie: cookieOperario, tarea, ot } = await fixtureOperarioConTarea();

    // 1. Antes de iniciar: la persona activa figura sin intervalo abierto (libre)
    const res1 = await req('GET', '/api/live/estado', cookieComercial);
    expect(res1.status).toBe(200);
    const data1: LiveEstadoRespuesta = await res1.json();
    for (const c of CLAVES_LIVE_ESTADO_RESPUESTA) expect(data1).toHaveProperty(c);

    const personaEnLive1 = data1.personas.find((p) => p.persona_id === persona.id);
    expect(personaEnLive1).toBeDefined();
    for (const c of CLAVES_LIVE_PERSONA_ITEM) expect(personaEnLive1).toHaveProperty(c);
    expect(personaEnLive1?.en_curso).toBe(false);
    expect(personaEnLive1?.intervalo_abierto).toBeNull();

    // 2. Operario inicia tarea -> /api/live/estado debe reflejarla en_curso con datos de OT
    const resInicio = await req('POST', `/api/mi-trabajo/tareas/${tarea.id}/iniciar`, cookieOperario, {
      claveIdempotencia: crypto.randomUUID(),
    });
    expect(resInicio.status).toBe(201);

    const res2 = await req('GET', '/api/live/estado', cookieComercial);
    const data2: LiveEstadoRespuesta = await res2.json();
    const personaEnLive2 = data2.personas.find((p) => p.persona_id === persona.id);
    expect(personaEnLive2?.en_curso).toBe(true);
    expect(personaEnLive2?.intervalo_abierto).not.toBeNull();
    expect(personaEnLive2?.intervalo_abierto?.tarea.id).toBe(tarea.id);
    expect(personaEnLive2?.intervalo_abierto?.tarea.orden_trabajo.codigo_ot).toBe(ot.codigo_ot);
    expect(personaEnLive2?.intervalo_abierto?.tarea.tipo).toBe('TALLER_CORTE');

    // 3. Operario pausa tarea -> /api/live/estado vuelve a en_curso = false
    const resPausa = await req('POST', `/api/mi-trabajo/tareas/${tarea.id}/pausar`, cookieOperario, {
      motivo: 'ALMUERZO',
      claveIdempotencia: crypto.randomUUID(),
    });
    expect(resPausa.status).toBe(200);

    const res3 = await req('GET', '/api/live/estado', cookieComercial);
    const data3: LiveEstadoRespuesta = await res3.json();
    const personaEnLive3 = data3.personas.find((p) => p.persona_id === persona.id);
    expect(personaEnLive3?.en_curso).toBe(false);
    expect(personaEnLive3?.intervalo_abierto).toBeNull();
  });

  it('CA-2.6 Resiliencia y Payload sin datos en publicarLive: si falla broadcast, la mutación responde 201', async () => {
    const { cookie: cookieOperario, tarea } = await fixtureOperarioConTarea();
    const fetchOriginal = globalThis.fetch;
    const envOriginal = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_ANON_KEY };
    process.env.SUPABASE_URL = 'https://realtime.example.test';
    process.env.SUPABASE_ANON_KEY = 'clave-de-prueba';
    const llamadasBroadcast: { url: string; body: unknown }[] = [];

    // Interceptamos fetch para verificar payload y simular caída de Realtime
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/realtime/v1/api/broadcast')) {
        const bodyParsed = init?.body ? JSON.parse(String(init.body)) : null;
        llamadasBroadcast.push({ url, body: bodyParsed });
        // Simular falla de red / servicio caído
        throw new Error('Supabase Realtime unreachable (simulated network failure)');
      }
      return fetchOriginal(input, init);
    }) as typeof fetch;

    try {
      const clave = crypto.randomUUID();
      const res = await req('POST', `/api/mi-trabajo/tareas/${tarea.id}/iniciar`, cookieOperario, {
        claveIdempotencia: clave,
      });

      // A pesar de la caída de Realtime, la petición DEBE responder 201 con éxito (CA-2.6)
      expect(res.status).toBe(201);

      // Verificamos que se intentó publicar después del commit y que el payload NO contiene nombres ni datos sensibles
      expect(llamadasBroadcast.length).toBeGreaterThanOrEqual(1);
      const ultimo = llamadasBroadcast[llamadasBroadcast.length - 1];
      const mensaje = (ultimo.body as { messages?: { payload?: { tipo?: string; id?: string } }[] })?.messages?.[0];
      expect(mensaje?.payload?.tipo).toBe('tarea.iniciar');
      expect(mensaje?.payload?.id).toBe(tarea.id);

      // Validar que solo contiene claves 'tipo' e 'id'
      expect(Object.keys(mensaje?.payload ?? {})).toEqual(['tipo', 'id']);

      // El intervalo sí quedó registrado en la base de datos
      const [int] = await admin`SELECT id FROM tarea_intervalo WHERE clave_idempotencia = ${clave}`;
      expect(int?.id).toBeDefined();
    } finally {
      globalThis.fetch = fetchOriginal;
      if (envOriginal.url === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = envOriginal.url;
      if (envOriginal.key === undefined) delete process.env.SUPABASE_ANON_KEY;
      else process.env.SUPABASE_ANON_KEY = envOriginal.key;
    }
  });
});
