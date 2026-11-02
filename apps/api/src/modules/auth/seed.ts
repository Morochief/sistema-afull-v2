import type { Sql } from 'postgres';
import { hashearPassword } from './password.js';

export const MIN_ADMIN_PASSWORD_LEN = 12;

export type SeedAdminInput = {
  username?: string;
  password: string;
};

export type SeedAdminResult = {
  creado: boolean;
  usuarioId: string;
  username: string;
};

/**
 * Crea el primer usuario administrador de forma idempotente.
 * Se inserta con `persona_id = NULL` (nullable en `usuario`) para no requerir
 * un registro ficticio en `persona` con `ci = '0'`.
 */
export async function sembrarAdmin(
  adminSql: Sql,
  input: SeedAdminInput,
): Promise<SeedAdminResult> {
  const username = (input.username ?? 'admin').trim().toLowerCase();
  if (!username) {
    throw new Error('El username del administrador no puede estar vacío.');
  }
  if (!input.password || input.password.length < MIN_ADMIN_PASSWORD_LEN) {
    throw new Error(
      `La contraseña del administrador debe tener al menos ${MIN_ADMIN_PASSWORD_LEN} caracteres.`,
    );
  }

  const passwordHash = await hashearPassword(input.password);

  return await adminSql.begin(async (tx) => {
    const [insertado] = await tx`
      INSERT INTO usuario (persona_id, username, password_hash, activo)
      VALUES (NULL, ${username}, ${passwordHash}, true)
      ON CONFLICT (username) DO NOTHING
      RETURNING id
    `;

    if (!insertado) {
      const [existente] = await tx`
        SELECT id FROM usuario WHERE username = ${username}
      `;
      return { creado: false, usuarioId: existente.id as string, username };
    }

    const nuevoId = insertado.id as string;

    await tx`
      INSERT INTO permiso_capacidad (usuario_id, capacidad)
      VALUES (${nuevoId}, 'admin')
      ON CONFLICT (usuario_id, capacidad) DO NOTHING
    `;

    const meta = JSON.stringify({ username });
    await tx`
      INSERT INTO evento_auditoria (usuario_id, accion, recurso, recurso_id, metadata)
      VALUES (${nuevoId}, 'usuario.crear_admin', 'usuario', ${nuevoId}, ${meta}::jsonb)
    `;

    return { creado: true, usuarioId: nuevoId, username };
  });
}
