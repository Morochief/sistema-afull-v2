import { admin } from './helpers.js';
import { hashearPassword } from '../../apps/api/src/modules/auth/password.js';
import { app } from '../../apps/api/src/index.js';

export async function crearUsuario(capacidades: string[] = [], activo = true) {
  const passHash = await hashearPassword('Password123!');
  const username = 'test_' + crypto.randomUUID().slice(0, 8);
  const [u] = await admin`
    INSERT INTO usuario (username, password_hash, activo)
    VALUES (${username}, ${passHash}, ${activo}) RETURNING id, username
  `;
  for (const cap of capacidades) {
    await admin`INSERT INTO permiso_capacidad (usuario_id, capacidad) VALUES (${u.id}, ${cap})`;
  }
  return { id: u.id as string, username: u.username as string };
}

export async function post(path: string, body: Record<string, unknown>, cookie?: string) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    origin: process.env.APP_ORIGIN || 'http://localhost:3000',
  };
  if (cookie) headers.cookie = cookie;
  return app.request(path, { method: 'POST', headers, body: JSON.stringify(body) });
}
