import { describe, it, expect, afterAll } from 'vitest';
import { admin, cerrarConexiones } from './helpers.js';
import { auditar, limpiarMetadata } from '../../apps/api/src/modules/auditoria/service.js';
import { crearUsuario } from './auth-helpers.js';

afterAll(cerrarConexiones);

describe('CA-0.5: Servicio de auditoría', () => {
  it('limpiarMetadata filtra contraseñas, hashes y tokens de forma recursiva', () => {
    const limpia = limpiarMetadata({
      user: 'admin',
      password: 'secret_password',
      nested: { token: 'jwt_token', api_key: 'key_123', safe: 42 },
    }) as { password: string; nested: { token: string; api_key: string; safe: number } };
    expect(limpia.password).toBe('[omitido]');
    expect(limpia.nested.token).toBe('[omitido]');
    expect(limpia.nested.api_key).toBe('[omitido]');
    expect(limpia.nested.safe).toBe(42);
  });

  it('si una transacción se revierte, el evento de auditoría también se revierte', async () => {
    const u = await crearUsuario();
    await expect(
      admin.begin(async (tx) => {
        await auditar({ usuarioId: u.id, accion: 'tx.prueba', recurso: 'test' }, tx);
        throw new Error('Forzar rollback');
      }),
    ).rejects.toThrow();
    const [ev] = await admin`SELECT id FROM evento_auditoria WHERE usuario_id = ${u.id} AND accion = 'tx.prueba'`;
    expect(ev).toBeUndefined();
  });
});
