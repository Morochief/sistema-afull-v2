import crypto from 'node:crypto';
import type { Sql } from 'postgres';

export const COOKIE_SESION = 'afull_session';
export const DURACION_SESION_DIAS = 30;
export const THROTTLE_ACTIVIDAD_MIN = 5;

export const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

export function generarTokenSesion(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

export async function actualizarActividadSiCorresponde(
  sql: Sql,
  sesionId: string,
  lastActiveAt: Date,
): Promise<void> {
  const minutos = (Date.now() - lastActiveAt.getTime()) / 60_000;
  if (minutos >= THROTTLE_ACTIVIDAD_MIN) {
    const nuevoExpires = new Date(Date.now() + DURACION_SESION_DIAS * 24 * 60 * 60 * 1000);
    await sql`UPDATE sesion SET last_active_at = now(), expires_at = ${nuevoExpires} WHERE id = ${sesionId}`;
  }
}
