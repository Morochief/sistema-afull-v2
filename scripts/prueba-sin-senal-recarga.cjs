/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console, process, navigator, setTimeout */
/**
 * Abrir la app SIN SEÑAL (service worker): con señal se entra y se abre "En la calle"; sin señal se recarga y
 * la pantalla aparece igual, con lo último que se bajó y el aviso. Necesita el sitio COMPILADO (en desarrollo
 * el service worker no se registra): `pnpm --filter @afull/web build && cd apps/web && npx vite preview --port 5173`,
 * o BASE_URL apuntando a Vercel.
 * Uso: node scripts/prueba-sin-senal-recarga.cjs
 */
const B = process.env.BASE_URL || 'http://localhost:5173';
const { chromium } = require('playwright');
const postgres = require('postgres');
require('dotenv').config({ path: ['.env', '.env.test'] });
(async () => {
  const sql = postgres(process.env.DATABASE_URL_ADMIN, { max: 1, prepare: false });
  const { hashearPassword } = await import('../apps/api/dist/modules/auth/password.js');
  const s = Math.random().toString(36).slice(2, 8);
  const [u] = await sql`INSERT INTO usuario (username, password_hash) VALUES (${'zz_test_sw_' + s}, ${await hashearPassword('Password123!')}) RETURNING id`;
  await sql`INSERT INTO permiso_capacidad (usuario_id, capacidad) VALUES (${u.id}, 'montaje')`;
  const [p] = await sql`INSERT INTO persona (nombre, ci) VALUES (${'zz_test_SW ' + s}, ${'CSW' + s}) RETURNING id`;
  await sql`UPDATE usuario SET persona_id = ${p.id} WHERE id = ${u.id}`;
  // La limpieza va en `finally`: si un paso falla, el usuario de prueba no queda activo (pasó el 2026-11-03).
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  try {
  const ctx = await b.newContext({ geolocation: { latitude: -25.32, longitude: -57.62 }, permissions: ['geolocation'] });
  const page = await ctx.newPage();
  await page.goto(B + '/login');
  await page.getByPlaceholder('Nombre de usuario').fill('zz_test_sw_' + s);
  await page.locator('input[type=password]').fill('Password123!');
  await page.getByRole('button', { name: /Iniciar sesión/ }).click();
  await page.waitForURL((x) => !x.pathname.startsWith('/login'));
  await page.goto(B + '/calle');
  await page.getByText('zz_test_SW ' + s).first().waitFor();
  await Promise.race([page.evaluate(() => navigator.serviceWorker.ready.then(() => 'listo')), new Promise((_, r) => setTimeout(() => r(new Error('SW no quedó listo')), 15000))]);
  await page.reload(); // la segunda carga ya pasa por el SW y guarda los assets
  await page.getByText('zz_test_SW ' + s).first().waitFor();
  await ctx.setOffline(true);
  await page.reload();
  await page.getByText(/Sin señal: mostrando lo bajado/).waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: /Marcar entrada/ }).waitFor();
  console.log('\n>>> RECARGA SIN SEÑAL EN VERDE: la app abrió y mostró lo último bajado <<<\n');
  } finally {
    await b.close();
    await sql`UPDATE usuario SET activo = false WHERE id = ${u.id}`;
    await sql`UPDATE persona SET activo = false WHERE id = ${p.id}`;
    await sql.end({ timeout: 3 });
  }
})().catch((e) => { console.log('FALLA', e.message.split('\n')[0]); process.exit(1); });
