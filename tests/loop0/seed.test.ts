import { describe, it, expect, afterAll } from 'vitest';
import { admin, cerrarConexiones } from './helpers.js';
import { post } from './auth-helpers.js';
import { sembrarAdmin } from '../../apps/api/src/modules/auth/seed.js';

const usuariosCreados: string[] = [];

afterAll(async () => {
  if (usuariosCreados.length > 0) {
    await admin`UPDATE usuario SET activo = false WHERE username = ANY(${usuariosCreados})`;
  }
  await cerrarConexiones();
});

describe('Seed del primer administrador (idempotencia, auditoría y login)', () => {
  it('rechaza contraseñas menores a 12 caracteres', async () => {
    const username = `zz_test_short_${crypto.randomUUID().slice(0, 8)}`;
    await expect(sembrarAdmin(admin, { username, password: 'Corta123!' })).rejects.toThrow(/12 caracteres/);
  });

  it('ejecutado dos veces crea una sola fila, una sola capacidad admin, audita y permite login HTTP real', async () => {
    const username = `zz_test_admin_${crypto.randomUUID().slice(0, 8)}`;
    usuariosCreados.push(username);
    const passOriginal = 'ClaveSeguraAdmin2026!';
    const passSegunda = 'OtraClaveQueNoDebePisar2026!';

    const r1 = await sembrarAdmin(admin, { username, password: passOriginal });
    expect(r1.creado).toBe(true);
    expect(r1.username).toBe(username);

    const r2 = await sembrarAdmin(admin, { username, password: passSegunda });
    expect(r2.creado).toBe(false);
    expect(r2.usuarioId).toBe(r1.usuarioId);

    const usuarios = await admin`SELECT id, persona_id, activo FROM usuario WHERE username = ${username}`;
    expect(usuarios).toHaveLength(1);
    expect(usuarios[0].persona_id).toBeNull();
    expect(usuarios[0].activo).toBe(true);

    const capacidades = await admin`
      SELECT capacidad FROM permiso_capacidad WHERE usuario_id = ${r1.usuarioId}
    `;
    expect(capacidades).toHaveLength(1);
    expect(capacidades[0].capacidad).toBe('admin');

    const auditorias = await admin`
      SELECT accion, recurso, recurso_id, metadata
      FROM evento_auditoria
      WHERE usuario_id = ${r1.usuarioId} AND accion = 'usuario.crear_admin'
    `;
    expect(auditorias).toHaveLength(1);
    expect(auditorias[0].recurso).toBe('usuario');
    expect(auditorias[0].recurso_id).toBe(r1.usuarioId);
    expect(JSON.stringify(auditorias[0].metadata)).not.toContain(passOriginal);

    // El segundo intento no debe haber pisado la contraseña original
    const loginFallido = await post('/api/auth/login', { username, password: passSegunda });
    expect(loginFallido.status).toBe(401);

    // Login real con la contraseña original emite cookie afull_session
    const loginExitoso = await post('/api/auth/login', { username, password: passOriginal });
    expect(loginExitoso.status).toBe(200);
    const setCookie = loginExitoso.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('afull_session=');
    expect(setCookie.toLowerCase()).toContain('httponly');

    // Desactivar el admin de prueba al finalizar y verificar que 0 admins zz_test_% queden activos
    await admin`UPDATE usuario SET activo = false WHERE id = ${r1.usuarioId}`;
    await admin`DELETE FROM sesion WHERE usuario_id = ${r1.usuarioId}`;
    const [{ activos }] = await admin`
      SELECT count(*)::int AS activos FROM usuario WHERE username LIKE 'zz_test_%' AND activo = true
    `;
    expect(activos).toBe(0);
  });
});
