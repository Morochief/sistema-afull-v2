import { config } from 'dotenv';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import postgres from 'postgres';
import { sembrarAdmin, MIN_ADMIN_PASSWORD_LEN } from '../apps/api/src/modules/auth/seed.js';

config({ path: ['.env', '.env.test'] });

function pedirPasswordOculta(promptText: string): Promise<string> {
  return new Promise((resolve) => {
    let silenciar = false;
    const salida = new Writable({
      write(chunk, encoding, callback) {
        if (!silenciar) process.stdout.write(chunk, encoding);
        callback();
      },
    });
    const rl = createInterface({
      input: process.stdin,
      output: salida,
      terminal: true,
      crlfDelay: Infinity,
    });
    rl.question(promptText, (respuesta) => {
      rl.close();
      process.stdout.write('\n');
      resolve(respuesta.replace(/^\uFEFF/, '').replace(/\r?\n$/, ''));
    });
    silenciar = true;
  });
}

async function main() {
  const dbUrl = process.env.DATABASE_URL_ADMIN;
  if (!dbUrl) {
    throw new Error('Falta DATABASE_URL_ADMIN. Defina la conexión administrativa antes de ejecutar el seed.');
  }

  const host = new URL(dbUrl).host;
  const testEnv = process.env.TEST_ENV ?? 'no definido';
  console.log(`[seed:admin] Destino host=${host} | TEST_ENV=${testEnv}`);

  const username = process.env.ADMIN_USERNAME?.trim() || 'admin';
  const password =
    process.env.ADMIN_PASSWORD ??
    (await pedirPasswordOculta(
      `Ingrese contraseña para '${username}' (mínimo ${MIN_ADMIN_PASSWORD_LEN} caracteres): `,
    ));

  const adminSql = postgres(dbUrl, { max: 1, connect_timeout: 10 });
  try {
    const res = await sembrarAdmin(adminSql, { username, password });
    if (res.creado) {
      console.log(`[seed:admin] Administrador '${res.username}' creado con éxito (id=${res.usuarioId}).`);
    } else {
      console.log(`[seed:admin] El usuario '${res.username}' ya existe (id=${res.usuarioId}). No se realizaron cambios.`);
    }
  } finally {
    await adminSql.end();
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[seed:admin] Error: ${msg}`);
  process.exit(1);
});
