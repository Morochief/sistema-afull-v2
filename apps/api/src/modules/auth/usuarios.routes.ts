import { Hono } from 'hono';
import { requireSesion, requireCapacidad } from './middleware.js';
import { sql } from '../../db/client.js';
import type { UsuarioVinculable } from '@afull/shared';

export const usuariosRoutes = new Hono().get(
  '/vinculables',
  requireSesion,
  requireCapacidad('admin'),
  async (c) => {
    const usuarios = await sql<UsuarioVinculable[]>`
      SELECT
        u.id,
        u.username,
        u.persona_id,
        coalesce(
          (
            SELECT json_agg(pc.capacidad ORDER BY pc.capacidad)
            FROM permiso_capacidad pc
            WHERE pc.usuario_id = u.id
          ),
          '[]'::json
        ) AS capacidades
      FROM usuario u
      WHERE u.activo = true
      ORDER BY u.username ASC
    `;
    return c.json(usuarios);
  }
);
