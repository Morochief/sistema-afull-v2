import { describe, it, expect, afterAll } from 'vitest';
import { admin, cerrarConexiones } from './helpers.js';
import { crearUsuario, post } from './auth-helpers.js';
import { app } from '../../apps/api/src/index.js';

afterAll(cerrarConexiones);

const cookieDe = (res: Response) => res.headers.get('set-cookie')!.split(';')[0];

describe('CA-0.1, CA-0.2, CA-0.4: Autenticación y Autorización', () => {
  it('login emite cookie con atributos seguros', async () => {
    const u = await crearUsuario(['comercial']);
    const res = await post('/api/auth/login', { username: u.username, password: 'Password123!' });
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie')!.toLowerCase();
    expect(setCookie).toContain('afull_session=');
    expect(setCookie).toContain('httponly');
    expect(setCookie).toContain('samesite=lax');
  });

  it('login con body inválido responde 400, no 500', async () => {
    const res = await post('/api/auth/login', { username: 'x' });
    expect(res.status).toBe(400);
  });

  it('CA-0.2: desactivar un usuario revoca su acceso inmediatamente (401)', async () => {
    const u = await crearUsuario(['comercial']);
    const cookie = cookieDe(await post('/api/auth/login', { username: u.username, password: 'Password123!' }));
    expect((await app.request('/api/auth/yo', { headers: { cookie } })).status).toBe(200);
    await admin`UPDATE usuario SET activo = false WHERE id = ${u.id}`;
    expect((await app.request('/api/auth/yo', { headers: { cookie } })).status).toBe(401);
  });

  it('CA-0.4: endpoint protegido devuelve 403 sin la capacidad requerida', async () => {
    const u = await crearUsuario(['taller']);
    const cookie = cookieDe(await post('/api/auth/login', { username: u.username, password: 'Password123!' }));
    expect((await app.request('/api/clientes', { headers: { cookie } })).status).toBe(403);
  });

  it('bloqueo por fuerza bruta tras 5 intentos fallidos (429)', async () => {
    const u = await crearUsuario();
    for (let i = 0; i < 5; i++) {
      await post('/api/auth/login', { username: u.username, password: 'WrongPassword' });
    }
    const sexto = await post('/api/auth/login', { username: u.username, password: 'Password123!' });
    expect(sexto.status).toBe(429);
  });

  it('CSRF: un Origin distinto al permitido se rechaza con 403', async () => {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      body: JSON.stringify({ username: 'a', password: 'b' }),
    });
    expect(res.status).toBe(403);
  });
});
