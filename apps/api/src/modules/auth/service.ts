import { sql } from '../../db/client.js';
import { verificarPassword, verificarDummy } from './password.js';
import { generarTokenSesion, DURACION_SESION_DIAS } from './session.js';
import { auditar } from '../auditoria/service.js';
import { ErrorApp } from '../../lib/errores.js';

const MAX_FALLOS_USUARIO = 5;
const MAX_FALLOS_IP = 20;
const credencialesInvalidas = () => new ErrorApp(401, 'Credenciales inválidas');

async function registrarIntento(username: string, ip: string | null, exito: boolean) {
  await sql`INSERT INTO intento_login (username, ip, exito) VALUES (${username}, ${ip}, ${exito})`;
}

export async function login(usernameRaw: string, pass: string, ipRaw?: string, ua?: string) {
  const username = usernameRaw.trim().toLowerCase();
  const ip = ipRaw ?? null;

  const [{ fallos_user }] = await sql`
    SELECT count(*)::int AS fallos_user FROM intento_login
    WHERE lower(username) = ${username} AND exito = false AND created_at > now() - INTERVAL '15 minutes'
  `;
  // Sin IP conocida no se puede limitar por IP (NULL nunca coincide); queda el límite por usuario.
  const fallosIp = ip
    ? (await sql`
        SELECT count(*)::int AS n FROM intento_login
        WHERE ip = ${ip} AND exito = false AND created_at > now() - INTERVAL '15 minutes'
      `)[0].n
    : 0;

  if (fallos_user >= MAX_FALLOS_USUARIO || fallosIp >= MAX_FALLOS_IP) {
    throw new ErrorApp(429, 'Demasiados intentos fallidos. Intente más tarde.');
  }

  const [u] = await sql`
    SELECT id, username, password_hash, activo FROM usuario WHERE lower(username) = ${username}
  `;
  if (!u || !u.activo) {
    await verificarDummy();
    await registrarIntento(username, ip, false);
    throw credencialesInvalidas();
  }
  if (!(await verificarPassword(pass, u.password_hash))) {
    await registrarIntento(username, ip, false);
    throw credencialesInvalidas();
  }

  await registrarIntento(username, ip, true);
  const { token, tokenHash } = generarTokenSesion();
  const expires = new Date(Date.now() + DURACION_SESION_DIAS * 24 * 60 * 60 * 1000);
  await sql`
    INSERT INTO sesion (usuario_id, token_hash, ip, user_agent, expires_at)
    VALUES (${u.id}, ${tokenHash}, ${ip}, ${ua ?? null}, ${expires})
  `;

  // Fuera de transacción y no bloqueante (decisión documentada en CLAUDE.md §3).
  try {
    await auditar({ usuarioId: u.id, accion: 'auth.login', recurso: 'sesion', ip: ip ?? undefined, metadata: { username: u.username } });
  } catch (err) {
    console.error('Fallo no bloqueante al auditar login:', err);
  }
  return { token, usuario: { id: u.id as string, username: u.username as string } };
}

export async function logout(sesionId: string, usuarioId: string, ip?: string) {
  await sql`DELETE FROM sesion WHERE id = ${sesionId}`;
  try {
    await auditar({ usuarioId, accion: 'auth.logout', recurso: 'sesion', ip });
  } catch (err) {
    console.error('Fallo no bloqueante al auditar logout:', err);
  }
}
