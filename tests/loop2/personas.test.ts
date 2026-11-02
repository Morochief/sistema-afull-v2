import { describe, it, expect, afterAll } from 'vitest';
import { admin, cerrarConexiones } from '../loop0/helpers.js';
import { crearUsuario, post } from '../loop0/auth-helpers.js';
import { app } from '../../apps/api/src/index.js';

afterAll(cerrarConexiones);

const ORIGEN = process.env.APP_ORIGIN || 'http://localhost:3000';

async function sesionCookie(capacidades: string[]) {
  const u = await crearUsuario(capacidades);
  const res = await post('/api/auth/login', { username: u.username, password: 'Password123!' });
  return { u, cookie: res.headers.get('set-cookie')!.split(';')[0] };
}

function req(method: string, path: string, cookie?: string, body?: unknown) {
  const headers: Record<string, string> = { origin: ORIGEN };
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return app.request(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe('L2.E1 — Personas: permisos por ruta, asignables y concurrencia 409', () => {
  it('GET /api/personas/asignables funciona con capacidad comercial y no es atrapado por /:id', async () => {
    const { cookie: cookieComercial } = await sesionCookie(['comercial']);
    const { cookie: cookieRrhh } = await sesionCookie(['rrhh']);

    // 1. Comercial puede consultar /api/personas/asignables
    const resAsignables = await req('GET', '/api/personas/asignables', cookieComercial);
    expect(resAsignables.status).toBe(200);
    const asignables = await resAsignables.json();
    expect(Array.isArray(asignables)).toBe(true);

    // 2. Comercial NO puede consultar /api/personas (requiere rrhh -> 403)
    const resListaComercial = await req('GET', '/api/personas', cookieComercial);
    expect(resListaComercial.status).toBe(403);

    // 3. RRHH SÍ puede consultar /api/personas
    const resListaRrhh = await req('GET', '/api/personas', cookieRrhh);
    expect(resListaRrhh.status).toBe(200);
  });

  it('CRUD completo de persona, control 409 por updatedAt y vinculación de usuario', async () => {
    const { cookie: cookieRrhh } = await sesionCookie(['rrhh']);
    const { cookie: cookieAdmin } = await sesionCookie(['admin']);
    const tag = Date.now().toString(36);
    const ci = `zz_ci_${tag}`;

    // 1. Alta de persona (RRHH)
    const resCrear = await req('POST', '/api/personas', cookieRrhh, {
      nombre: `zz_test_persona_${tag}`,
      ci,
      cargo: 'Operario de Taller',
      departamento: 'Producción',
    });
    expect(resCrear.status).toBe(201);
    const persona = await resCrear.json();
    expect(persona.id).toBeDefined();
    expect(persona.nombre).toBe(`zz_test_persona_${tag}`);
    expect(persona.activo).toBe(true);

    try {
      // 2. Detalle de persona (RRHH)
      const resDetalle = await req('GET', `/api/personas/${persona.id}`, cookieRrhh);
      expect(resDetalle.status).toBe(200);
      const detalle = await resDetalle.json();
      expect(detalle.ci).toBe(ci);

      // 3. Edición exitosa (RRHH)
      const resEditar = await req('PATCH', `/api/personas/${persona.id}`, cookieRrhh, {
        cargo: 'Jefe de Taller',
        updatedAt: detalle.updated_at,
      });
      expect(resEditar.status).toBe(200);
      const editada = await resEditar.json();
      expect(editada.cargo).toBe('Jefe de Taller');

      // 4. Concurrencia 409: intentar editar con el updatedAt anterior
      const res409 = await req('PATCH', `/api/personas/${persona.id}`, cookieRrhh, {
        cargo: 'Otro Cargo',
        updatedAt: detalle.updated_at, // Stale!
      });
      expect(res409.status).toBe(409);

      // 5. Vincular usuario (Admin): RRHH no puede (403)
      const uOperario = await crearUsuario(['taller']);
      const resVincularRrhh = await req('PATCH', `/api/personas/${persona.id}/usuario`, cookieRrhh, {
        usuarioId: uOperario.id,
      });
      expect(resVincularRrhh.status).toBe(403);

      // Admin sí puede vincular usuario
      const resVincularAdmin = await req('PATCH', `/api/personas/${persona.id}/usuario`, cookieAdmin, {
        usuarioId: uOperario.id,
      });
      expect(resVincularAdmin.status).toBe(200);

      // Al consultar asignables con comercial, ahora aparece esta persona
      const { cookie: cookieComercial } = await sesionCookie(['comercial']);
      const resAsig = await req('GET', `/api/personas/asignables?q=${encodeURIComponent(persona.nombre)}`, cookieComercial);
      expect(resAsig.status).toBe(200);
      const asigItems = await resAsig.json();
      expect(asigItems.some((a: { id: string }) => a.id === persona.id)).toBe(true);

      // Desvincular usuario con null
      const resDesvincular = await req('PATCH', `/api/personas/${persona.id}/usuario`, cookieAdmin, {
        usuarioId: null,
      });
      expect(resDesvincular.status).toBe(200);
    } finally {
      await admin`UPDATE usuario SET persona_id = NULL WHERE persona_id = ${persona.id}`;
      await admin`DELETE FROM persona WHERE id = ${persona.id}`;
    }
  });
});
