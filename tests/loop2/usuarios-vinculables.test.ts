import { describe, it, expect, afterAll } from 'vitest';
import { cerrarConexiones } from '../loop0/helpers.js';
import { crearUsuario, post } from '../loop0/auth-helpers.js';
import { app } from '../../apps/api/src/index.js';
import { CLAVES_USUARIO_VINCULABLE } from '../../packages/shared/src/index.js';

afterAll(cerrarConexiones);

const ORIGEN = process.env.APP_ORIGIN || 'http://localhost:3000';

async function sesionCookie(capacidades: string[]) {
  const u = await crearUsuario(capacidades);
  const res = await post('/api/auth/login', { username: u.username, password: 'Password123!' });
  return { u, cookie: res.headers.get('set-cookie')!.split(';')[0] };
}

function req(method: string, path: string, cookie?: string) {
  const headers: Record<string, string> = { origin: ORIGEN };
  if (cookie) headers.cookie = cookie;
  return app.request(path, { method, headers });
}

describe('GET /api/usuarios/vinculables — listado de usuarios para vincular (solo admin)', () => {
  it('responde 401 sin sesión autenticada', async () => {
    const res = await req('GET', '/api/usuarios/vinculables');
    expect(res.status).toBe(401);
  });

  it('responde 403 con usuario sin capacidad admin (ej: comercial, rrhh)', async () => {
    const { cookie: cookieComercial } = await sesionCookie(['comercial']);
    const resComercial = await req('GET', '/api/usuarios/vinculables', cookieComercial);
    expect(resComercial.status).toBe(403);

    const { cookie: cookieRrhh } = await sesionCookie(['rrhh']);
    const resRrhh = await req('GET', '/api/usuarios/vinculables', cookieRrhh);
    expect(resRrhh.status).toBe(403);
  });

  it('responde 200 con admin y devuelve usuarios sin exponer credenciales', async () => {
    const { u, cookie: cookieAdmin } = await sesionCookie(['admin']);
    const res = await req('GET', '/api/usuarios/vinculables', cookieAdmin);
    expect(res.status).toBe(200);

    const usuarios = (await res.json()) as Record<string, unknown>[];
    expect(Array.isArray(usuarios)).toBe(true);
    expect(usuarios.length).toBeGreaterThan(0);

    // Encuentra el usuario de prueba
    const encontrado = usuarios.find((item) => item.id === u.id);
    expect(encontrado).toBeDefined();
    expect(encontrado?.username).toBe(u.username);
    expect(Array.isArray(encontrado?.capacidades)).toBe(true);

    // Garantizar que ningún usuario expone hashes de contraseña ni claves privadas
    for (const item of usuarios) {
      expect(item.password_hash).toBeUndefined();
      expect(item.password).toBeUndefined();
      expect(item.hash).toBeUndefined();

      // Debe cumplir el contrato de claves permitidas
      for (const k of CLAVES_USUARIO_VINCULABLE) {
        expect(k in item).toBe(true);
      }
    }
  });
});
