import { sql } from '../../db/client.js';
import { auditar } from '../auditoria/service.js';
import { escaparLike } from '../../lib/paginacion.js';
import { ErrorApp, traducirErrorPg } from '../../lib/errores.js';
import type { PersonaAsignable } from '@afull/shared';
import type { Ctx } from './service.js';

export async function vincularUsuario(ctx: Ctx, personaId: string, usuarioId: string | null) {
  try {
    const [persona] = await sql<{ id: string; nombre: string }[]>`
      SELECT id, nombre FROM persona WHERE id = ${personaId}
    `;
    if (!persona) throw new ErrorApp(404, 'Persona no encontrada');

    if (usuarioId !== null) {
      const [usuario] = await sql<{ id: string; username: string }[]>`
        SELECT id, username FROM usuario WHERE id = ${usuarioId}
      `;
      if (!usuario) throw new ErrorApp(404, 'Usuario no encontrado');
    }

    await sql.begin(async (tx) => {
      await tx`UPDATE usuario SET persona_id = NULL WHERE persona_id = ${personaId}`;
      if (usuarioId !== null) {
        await tx`UPDATE usuario SET persona_id = ${personaId} WHERE id = ${usuarioId}`;
      }
    });

    await auditar({
      usuarioId: ctx.usuarioId,
      accion: 'persona.vincular_usuario',
      recurso: 'persona',
      recursoId: personaId,
      ip: ctx.ip,
      metadata: { usuarioId },
    });

    return { personaId, usuarioId };
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}

export async function listarPersonasAsignables(q?: string): Promise<PersonaAsignable[]> {
  try {
    const patron = q?.trim() ? `%${escaparLike(q.trim())}%` : null;
    const items = await sql<PersonaAsignable[]>`
      SELECT DISTINCT p.id, p.nombre
      FROM persona p
      JOIN usuario u ON u.persona_id = p.id AND u.activo = true
      JOIN permiso_capacidad pc ON pc.usuario_id = u.id AND pc.capacidad IN ('taller', 'montaje')
      WHERE p.activo = true
        ${patron ? sql`AND p.nombre ILIKE ${patron}` : sql``}
      ORDER BY p.nombre ASC
    `;
    return [...items];
  } catch (e) {
    traducirErrorPg(e);
  }
}
