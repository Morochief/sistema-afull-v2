import { describe, it, expect, afterAll } from 'vitest';
import { admin, cerrarConexiones, registrarUsuarioDePrueba } from './helpers.js';
import { post } from './auth-helpers.js';
import { sesion } from '../loop3/helpers-comercial.js';

/** Administración de usuarios: alta, permisos, baja, contraseña (admin) y cambio de la propia. */
afterAll(cerrarConexiones);
const nombre = () => 'zz_test_ua_' + crypto.randomUUID().slice(0, 8);

async function entrar(username: string, password: string) {
  const r = await post('/api/auth/login', { username, password });
  return { status: r.status, cookie: r.headers.get('set-cookie')?.split(';')[0] };
}

describe('Usuarios (admin)', () => {
  it('admin crea un usuario con permisos; entra con su clave; la clave no queda en la base ni en la auditoría', async () => {
    const jefe = await sesion(['admin']);
    const username = nombre();
    const r = await jefe('POST', '/api/usuarios', { username: username.toUpperCase(), password: 'ClaveNueva1', capacidades: ['taller', 'montaje'] });
    expect(r.status).toBe(201);
    registrarUsuarioDePrueba(r.j.id as string);
    expect(r.j.username).toBe(username); // se guarda en minúsculas
    expect((await entrar(username, 'ClaveNueva1')).status).toBe(200);
    const [u] = await admin`SELECT password_hash FROM usuario WHERE id = ${r.j.id as string}`;
    expect(u.password_hash).toMatch(/^\$argon2id\$/);
    const [aud] = await admin`SELECT count(*)::int AS n FROM evento_auditoria WHERE metadata::text LIKE '%ClaveNueva1%'`;
    expect(aud.n).toBe(0);
    const lista = (await jefe('GET', `/api/usuarios?q=${username}`)).j as { items: { capacidades: string[] }[]; total: number };
    expect(lista.total).toBe(1);
    expect(lista.items[0].capacidades).toEqual(['montaje', 'taller']);
    // Repetido → 409; clave débil o sin permisos → 400.
    expect((await jefe('POST', '/api/usuarios', { username, password: 'ClaveNueva1', capacidades: ['taller'] })).status).toBe(409);
    expect((await jefe('POST', '/api/usuarios', { username: nombre(), password: 'corta', capacidades: ['taller'] })).status).toBe(400);
    expect((await jefe('POST', '/api/usuarios', { username: nombre(), password: 'ClaveNueva1', capacidades: [] })).status).toBe(400);
  });

  it('sin admin: 403 en todo', async () => {
    const sofi = await sesion(['comercial', 'rrhh']);
    expect((await sofi('GET', '/api/usuarios')).status).toBe(403);
    expect((await sofi('POST', '/api/usuarios', { username: nombre(), password: 'ClaveNueva1', capacidades: ['admin'] })).status).toBe(403);
  });

  it('desactivar corta la sesión al instante; el admin no puede desactivarse ni quitarse el admin', async () => {
    const jefe = await sesion(['admin']);
    const username = nombre();
    const nuevo = (await jefe('POST', '/api/usuarios', { username, password: 'ClaveNueva1', capacidades: ['taller'] })).j;
    registrarUsuarioDePrueba(nuevo.id as string);
    const { cookie } = await entrar(username, 'ClaveNueva1');
    const yo = async () => (await post('/api/auth/logout', {}, cookie)).status;
    const r = await jefe('PATCH', `/api/usuarios/${nuevo.id}`, { activo: false, capacidades: ['taller', 'comercial'] });
    expect(r.status).toBe(200);
    expect(r.j.activo).toBe(false);
    expect(await yo()).toBe(401);
    expect((await entrar(username, 'ClaveNueva1')).status).toBe(401);
    expect((await jefe('PATCH', `/api/usuarios/${jefe.usuarioId}`, { activo: false })).status).toBe(400);
    expect((await jefe('PATCH', `/api/usuarios/${jefe.usuarioId}`, { capacidades: ['comercial'] })).status).toBe(400);
  });

  it('el admin pone una clave nueva: las sesiones viejas mueren y entra con la nueva', async () => {
    const jefe = await sesion(['admin']);
    const username = nombre();
    const nuevo = (await jefe('POST', '/api/usuarios', { username, password: 'ClaveVieja1', capacidades: ['montaje'] })).j;
    registrarUsuarioDePrueba(nuevo.id as string);
    const vieja = await entrar(username, 'ClaveVieja1');
    expect((await jefe('POST', `/api/usuarios/${nuevo.id}/password`, { password: 'ClaveNueva2' })).status).toBe(200);
    expect((await post('/api/auth/logout', {}, vieja.cookie)).status).toBe(401);
    expect((await entrar(username, 'ClaveVieja1')).status).toBe(401);
    expect((await entrar(username, 'ClaveNueva2')).status).toBe(200);
  });

  it('cada uno cambia su clave con la actual; cierra sus otras sesiones y deja la de este navegador', async () => {
    const jefe = await sesion(['admin']);
    const username = nombre();
    const nuevo = (await jefe('POST', '/api/usuarios', { username, password: 'MiClave123', capacidades: ['taller'] })).j;
    registrarUsuarioDePrueba(nuevo.id as string);
    const a = await entrar(username, 'MiClave123');
    const b = await entrar(username, 'MiClave123');
    expect((await post('/api/auth/cambiar-password', { actual: 'otra', nueva: 'Nueva12345' }, a.cookie)).status).toBe(400);
    expect((await post('/api/auth/cambiar-password', { actual: 'MiClave123', nueva: 'Nueva12345' }, a.cookie)).status).toBe(200);
    expect((await post('/api/auth/logout', {}, b.cookie)).status).toBe(401);
    expect((await post('/api/auth/logout', {}, a.cookie)).status).toBe(200);
    expect((await entrar(username, 'Nueva12345')).status).toBe(200);
  });
});
