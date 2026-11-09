import type { TransactionSql } from 'postgres';
import type { z } from 'zod';
import type { filtroUsuariosSchema, nuevoUsuarioSchema, patchUsuarioSchema } from '@afull/shared';
import { sql } from '../../db/client.js';
import { auditar } from '../auditoria/service.js';
import { ErrorApp, traducirErrorPg } from '../../lib/errores.js';
import { TAM_PAGINA, desplazamiento, escaparLike, armarPagina } from '../../lib/paginacion.js';
import type { Ctx } from '../clientes/service.js';
import { hashearPassword, verificarPassword } from './password.js';

type Filtro = z.infer<typeof filtroUsuariosSchema>;

const COLUMNAS = sql`
  u.id, u.username, u.activo, u.created_at, u.persona_id, p.nombre AS persona_nombre,
  coalesce((SELECT json_agg(pc.capacidad ORDER BY pc.capacidad) FROM permiso_capacidad pc WHERE pc.usuario_id = u.id), '[]'::json) AS capacidades,
  (SELECT max(s.last_active_at) FROM sesion s WHERE s.usuario_id = u.id) AS ultimo_acceso`;

async function enTx<T>(fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
  try {
    return (await sql.begin(fn)) as T;
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    if ((e as { code?: string }).code === '23505') throw new ErrorApp(409, 'Ya existe un usuario con ese nombre');
    traducirErrorPg(e);
  }
}

/** Listado de usuarios (admin): 25 por página, búsqueda por usuario o persona, filtro de activos. */
export async function listarUsuarios(f: Filtro) {
  const patron = f.q ? `%${escaparLike(f.q)}%` : null;
  const donde = sql`WHERE ${true}
    ${f.activo ? sql`AND u.activo = ${f.activo === 'true'}` : sql``}
    ${patron ? sql`AND (u.username ILIKE ${patron} OR p.nombre ILIKE ${patron})` : sql``}`;
  const [{ total }] = await sql`SELECT count(*)::int AS total FROM usuario u LEFT JOIN persona p ON p.id = u.persona_id ${donde}`;
  const items = await sql`
    SELECT ${COLUMNAS} FROM usuario u LEFT JOIN persona p ON p.id = u.persona_id ${donde}
    ORDER BY u.activo DESC, u.username LIMIT ${TAM_PAGINA} OFFSET ${desplazamiento(f.pagina)}
  `;
  return armarPagina([...items], total, f.pagina);
}

async function ponerCapacidades(tx: TransactionSql, usuarioId: string, caps: string[]) {
  await tx`DELETE FROM permiso_capacidad WHERE usuario_id = ${usuarioId}`;
  for (const c of [...new Set(caps)]) await tx`INSERT INTO permiso_capacidad (usuario_id, capacidad) VALUES (${usuarioId}, ${c})`;
}

/** Alta: la contraseña se guarda solo como hash Argon2id; nunca va a la auditoría. */
export async function crearUsuario(ctx: Ctx, d: z.infer<typeof nuevoUsuarioSchema>) {
  const passwordHash = await hashearPassword(d.password);
  return enTx(async (tx) => {
    const [u] = await tx`INSERT INTO usuario (username, password_hash) VALUES (${d.username}, ${passwordHash}) RETURNING id, username`;
    await ponerCapacidades(tx, u.id, d.capacidades);
    await auditar({ usuarioId: ctx.usuarioId, accion: 'usuario.crear', recurso: 'usuario', recursoId: u.id, ip: ctx.ip, metadata: { username: u.username, capacidades: d.capacidades } }, tx);
    return { id: u.id as string, username: u.username as string };
  });
}

/** Permisos y alta/baja. Un admin no puede quitarse a sí mismo el admin ni desactivarse (no quedarse afuera). */
export async function editarUsuario(ctx: Ctx, id: string, d: z.infer<typeof patchUsuarioSchema>) {
  return enTx(async (tx) => {
    const [u] = await tx`SELECT id, username, activo FROM usuario WHERE id = ${id} FOR UPDATE`;
    if (!u) throw new ErrorApp(404, 'Usuario no encontrado');
    const esUnoMismo = id === ctx.usuarioId;
    if (esUnoMismo && d.activo === false) throw new ErrorApp(400, 'No podés desactivar tu propio usuario');
    if (esUnoMismo && d.capacidades && !d.capacidades.includes('admin')) throw new ErrorApp(400, 'No podés quitarte el permiso de administrador');
    if (d.capacidades) await ponerCapacidades(tx, id, d.capacidades);
    if (d.activo !== undefined && d.activo !== u.activo) {
      await tx`UPDATE usuario SET activo = ${d.activo} WHERE id = ${id}`;
      // Desactivar corta la sesión al instante (además, cada pedido revisa `usuario.activo`).
      if (!d.activo) await tx`DELETE FROM sesion WHERE usuario_id = ${id}`;
    }
    // Siempre tiene que quedar al menos un administrador activo.
    const [{ admins }] = await tx`
      SELECT count(*)::int AS admins FROM usuario x JOIN permiso_capacidad pc ON pc.usuario_id = x.id AND pc.capacidad = ${'admin'} WHERE x.activo
    `;
    if (admins === 0) throw new ErrorApp(400, 'Tiene que quedar al menos un administrador activo');
    await auditar({ usuarioId: ctx.usuarioId, accion: 'usuario.editar', recurso: 'usuario', recursoId: id, ip: ctx.ip, metadata: { capacidades: d.capacidades ?? null, activo: d.activo ?? null } }, tx);
    const [fila] = await tx`SELECT ${COLUMNAS} FROM usuario u LEFT JOIN persona p ON p.id = u.persona_id WHERE u.id = ${id}`;
    return fila;
  });
}

/** El admin pone una contraseña nueva (p. ej. "me olvidé"): se cierran todas las sesiones de ese usuario. */
export async function resetearPassword(ctx: Ctx, id: string, password: string) {
  const passwordHash = await hashearPassword(password);
  return enTx(async (tx) => {
    const [u] = await tx`UPDATE usuario SET password_hash = ${passwordHash} WHERE id = ${id} RETURNING id`;
    if (!u) throw new ErrorApp(404, 'Usuario no encontrado');
    await tx`DELETE FROM sesion WHERE usuario_id = ${id}`;
    await auditar({ usuarioId: ctx.usuarioId, accion: 'usuario.resetear_password', recurso: 'usuario', recursoId: id, ip: ctx.ip }, tx);
    return { id };
  });
}

/** Cada uno cambia la suya (con la actual). Se cierran sus otras sesiones; la de este navegador sigue. */
export async function cambiarMiPassword(ctx: Ctx, sesionId: string, actual: string, nueva: string) {
  const [u] = await sql`SELECT password_hash FROM usuario WHERE id = ${ctx.usuarioId}`;
  if (!u || !(await verificarPassword(actual, u.password_hash))) throw new ErrorApp(400, 'La contraseña actual no es correcta');
  const passwordHash = await hashearPassword(nueva);
  return enTx(async (tx) => {
    await tx`UPDATE usuario SET password_hash = ${passwordHash} WHERE id = ${ctx.usuarioId}`;
    await tx`DELETE FROM sesion WHERE usuario_id = ${ctx.usuarioId} AND id <> ${sesionId}`;
    await auditar({ usuarioId: ctx.usuarioId, accion: 'usuario.cambiar_password', recurso: 'usuario', recursoId: ctx.usuarioId, ip: ctx.ip }, tx);
    return { ok: true };
  });
}
