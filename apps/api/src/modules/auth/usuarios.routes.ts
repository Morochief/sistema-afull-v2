import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { filtroUsuariosSchema, nuevoUsuarioSchema, patchUsuarioSchema, resetPasswordSchema, type UsuarioVinculable } from '@afull/shared';
import { requireSesion, requireCapacidad } from './middleware.js';
import { sql } from '../../db/client.js';
import { ipDe } from '../../lib/ip.js';
import type { Ctx } from '../clientes/service.js';
import { listarUsuarios, crearUsuario, editarUsuario, resetearPassword } from './usuarios.service.js';

const ctxDe = (c: Context): Ctx => ({ usuarioId: c.get('usuario').id, ip: ipDe(c) });
const idDe = (c: Context) => z.string().uuid().parse(c.req.param('id'));
const cuerpo = (c: Context) => c.req.json().catch(() => null);

/** Administración de usuarios: solo admin. Las contraseñas nunca se devuelven ni se auditan. */
export const usuariosRoutes = new Hono()
  .use('*', requireSesion, requireCapacidad('admin'))
  .get('/', async (c) => c.json(await listarUsuarios(filtroUsuariosSchema.parse(c.req.query()))))
  .post('/', async (c) => c.json(await crearUsuario(ctxDe(c), nuevoUsuarioSchema.parse(await cuerpo(c))), 201))
  .patch('/:id', async (c) => c.json(await editarUsuario(ctxDe(c), idDe(c), patchUsuarioSchema.parse(await cuerpo(c)))))
  .post('/:id/password', async (c) => c.json(await resetearPassword(ctxDe(c), idDe(c), resetPasswordSchema.parse(await cuerpo(c)).password)))
  .get('/vinculables', async (c) => {
    const usuarios = await sql<UsuarioVinculable[]>`
      SELECT u.id, u.username, u.persona_id,
        coalesce((SELECT json_agg(pc.capacidad ORDER BY pc.capacidad) FROM permiso_capacidad pc WHERE pc.usuario_id = u.id), '[]'::json) AS capacidades
      FROM usuario u WHERE u.activo = ${true} ORDER BY u.username ASC
    `;
    return c.json(usuarios);
  });
