import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { sql } from '../../db/client.js';
import { COOKIE_SESION, hashToken, actualizarActividadSiCorresponde } from './session.js';
import { ErrorApp } from '../../lib/errores.js';

export type UsuarioSesion = { id: string; username: string; capacidades: string[] };

declare module 'hono' {
  interface ContextVariableMap {
    usuario: UsuarioSesion;
    sesionId: string;
  }
}

export const requireSesion: MiddlewareHandler = async (c, next) => {
  const token = getCookie(c, COOKIE_SESION);
  if (!token) throw new ErrorApp(401, 'No autenticado');

  const [s] = await sql`
    SELECT s.id AS sesion_id, s.last_active_at,
           u.id AS usuario_id, u.username, u.activo
    FROM sesion s JOIN usuario u ON u.id = s.usuario_id
    WHERE s.token_hash = ${hashToken(token)} AND s.expires_at > now()
  `;
  if (!s || !s.activo) throw new ErrorApp(401, 'Sesión inválida o usuario inactivo');

  const caps = await sql`SELECT capacidad FROM permiso_capacidad WHERE usuario_id = ${s.usuario_id}`;
  c.set('sesionId', s.sesion_id);
  c.set('usuario', {
    id: s.usuario_id,
    username: s.username,
    capacidades: caps.map((r) => r.capacidad as string),
  });

  await actualizarActividadSiCorresponde(sql, s.sesion_id, new Date(s.last_active_at));
  await next();
};

export const requireCapacidad = (cap: string): MiddlewareHandler => async (c, next) => {
  const usuario = c.get('usuario');
  if (!usuario) throw new ErrorApp(401, 'No autenticado');
  if (!usuario.capacidades.includes('admin') && !usuario.capacidades.includes(cap)) {
    throw new ErrorApp(403, `Permiso denegado: requiere capacidad ${cap}`);
  }
  await next();
};

const METODOS_ESCRITURA = ['POST', 'PUT', 'PATCH', 'DELETE'];

// CSRF: SameSite=Lax + Origin. En producción falla cerrado (exige APP_ORIGIN y Origin).
export const verificarOrigen: MiddlewareHandler = async (c, next) => {
  if (METODOS_ESCRITURA.includes(c.req.method)) {
    const origin = c.req.header('origin');
    const appOrigin = process.env.APP_ORIGIN;
    const produccion = process.env.NODE_ENV === 'production';
    if (produccion && !appOrigin) throw new ErrorApp(403, 'APP_ORIGIN no configurada');
    if (produccion && !origin) throw new ErrorApp(403, 'Origen requerido (CSRF)');
    if (appOrigin && origin && origin !== appOrigin) throw new ErrorApp(403, 'Origen no permitido (CSRF)');
  }
  await next();
};
