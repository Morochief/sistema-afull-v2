import { describe, it, expect, afterAll } from 'vitest';
import { admin, api, cerrarConexiones } from './helpers.js';

afterAll(cerrarConexiones);

describe('CA-0.8: Inmutabilidad estricta de auditoría', () => {
  it('la API puede insertar registros pero no modificarlos ni borrarlos', async () => {
    const [ins] = await api`
      INSERT INTO evento_auditoria (accion, recurso) VALUES ('test.audit', 'test') RETURNING id
    `;
    expect(ins.id).toBeDefined();
    await expect(api`UPDATE evento_auditoria SET accion = 'hack' WHERE id = ${ins.id}`).rejects.toThrow();
    await expect(api`DELETE FROM evento_auditoria WHERE id = ${ins.id}`).rejects.toThrow();
  });

  it('el rol afull_api no puede deshabilitar ni borrar triggers', async () => {
    await expect(api`ALTER TABLE evento_auditoria DISABLE TRIGGER ALL`).rejects.toThrow();
    await expect(api`DROP TRIGGER trg_bloquear_modificacion_auditoria ON evento_auditoria`).rejects.toThrow();
  });

  it('incluso el rol postgres (admin) tiene bloqueado el UPDATE/DELETE/TRUNCATE por trigger', async () => {
    const [ins] = await admin`
      INSERT INTO evento_auditoria (accion, recurso) VALUES ('test.admin', 'test') RETURNING id
    `;
    await expect(admin`UPDATE evento_auditoria SET accion = 'hacked' WHERE id = ${ins.id}`).rejects.toThrow();
    await expect(admin`TRUNCATE evento_auditoria`).rejects.toThrow();
  });
});
