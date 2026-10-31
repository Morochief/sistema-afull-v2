import { describe, it, expect, afterAll } from 'vitest';
import { admin, cerrarConexiones } from './helpers.js';

afterAll(cerrarConexiones);

describe('Borrado lógico de usuarios y protección por auditoría', () => {
  it('un usuario con eventos de auditoría no puede ser borrado físicamente (RESTRICT)', async () => {
    const [u] = await admin`
      INSERT INTO usuario (username, password_hash) VALUES (${'u_' + Date.now()}, 'hash') RETURNING id
    `;
    await admin`INSERT INTO evento_auditoria (usuario_id, accion, recurso) VALUES (${u.id}, 'test', 'test')`;
    await expect(admin`DELETE FROM usuario WHERE id = ${u.id}`).rejects.toMatchObject({ code: '23503' });
  });

  it('el usuario sí puede desactivarse limpiamente', async () => {
    const [u] = await admin`
      INSERT INTO usuario (username, password_hash) VALUES (${'u_act_' + Date.now()}, 'hash') RETURNING id
    `;
    await admin`UPDATE usuario SET activo = false WHERE id = ${u.id}`;
    const [verif] = await admin`SELECT activo FROM usuario WHERE id = ${u.id}`;
    expect(verif.activo).toBe(false);
  });
});
