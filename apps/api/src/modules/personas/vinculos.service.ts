import { sql } from '../../db/client.js';
import { auditar } from '../auditoria/service.js';
import { escaparLike } from '../../lib/paginacion.js';
import { ErrorApp, traducirErrorPg } from '../../lib/errores.js';
import type { PersonaAsignable } from '@afull/shared';
import type { Ctx } from './service.js';

export async function vincularUsuario(ctx: Ctx, personaId: string, usuarioId: string | null) {
  try {
    return await sql.begin(async (tx) => {
      const [persona] = await tx<{ id: string }[]>`SELECT id FROM persona WHERE id = ${personaId} FOR UPDATE`;
      if (!persona) throw new ErrorApp(404, 'Persona no encontrada');

      if (usuarioId !== null) {
        const [usuario] = await tx<{ id: string; persona_id: string | null }[]>`
          SELECT id, persona_id FROM usuario WHERE id = ${usuarioId} FOR UPDATE
        `;
        if (!usuario) throw new ErrorApp(404, 'Usuario no encontrado');
        // No pisar en silencio el vínculo de un usuario con otra persona
        if (usuario.persona_id !== null && usuario.persona_id !== personaId) {
          throw new ErrorApp(409, 'El usuario ya está vinculado a otra persona; desvinculalo primero');
        }
      }

      await tx`UPDATE usuario SET persona_id = NULL WHERE persona_id = ${personaId}`;
      if (usuarioId !== null) {
        await tx`UPDATE usuario SET persona_id = ${personaId} WHERE id = ${usuarioId}`;
      }

      // Auditoría dentro de la misma transacción (CA-0.5)
      await auditar(
        {
          usuarioId: ctx.usuarioId,
          accion: 'persona.vincular_usuario',
          recurso: 'persona',
          recursoId: personaId,
          ip: ctx.ip,
          metadata: { usuarioId },
        },
        tx,
      );
      return { personaId, usuarioId };
    });
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
      JOIN permiso_capacidad pc ON pc.usuario_id = u.id AND pc.capacidad IN ('taller', 'montaje', 'diseno')
      WHERE p.activo = true
        ${patron ? sql`AND p.nombre ILIKE ${patron}` : sql``}
      ORDER BY p.nombre ASC
    `;
    return [...items];
  } catch (e) {
    traducirErrorPg(e);
  }
}
