/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console, process */
/**
 * Recorrido de usuarios: el admin crea un usuario de taller desde la pantalla, el usuario entra,
 * cambia su clave desde "Mi clave" y vuelve a entrar con la nueva; el admin lo desactiva y ya no entra.
 * Uso: node scripts/prueba-usuarios.cjs   (BASE_URL y CHROMIUM_PATH opcionales)
 */
const { chromium } = require('playwright');
const postgres = require('postgres');
const { config } = require('dotenv');

config({ path: ['.env', '.env.test'] });
const B = process.env.BASE_URL || 'http://localhost:5173';

(async () => {
  const sql = postgres(process.env.DATABASE_URL_ADMIN, { max: 1, prepare: false });
  const { hashearPassword } = await import('../apps/api/dist/modules/auth/password.js');
  const s = Math.random().toString(36).slice(2, 7);
  const jefe = `zz_test_jefe_${s}`;
  const nuevo = `zz_test_nuevo_${s}`;
  const opciones = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : process.platform === 'win32' ? { channel: 'chrome' } : {};
  const browser = await chromium.launch(opciones);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.setDefaultTimeout(12000);
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  let n = 0;
  const paso = async (t, fn) => {
    n += 1;
    try { await fn(); console.log('OK  ', n, t); } catch (e) {
      console.log('FALLA', n, t, '->', e.message.split('\n')[0]);
      await page.screenshot({ path: `prueba-usuarios-falla-${n}.png` });
      throw e;
    }
  };
  const entrar = async (u, p) => {
    await ctx.clearCookies();
    // Sin cookies, la pantalla abierta puede redirigir sola a /login y cortar este goto: se reintenta una vez.
    await page.goto(B + '/login').catch(() => page.goto(B + '/login'));
    await page.getByPlaceholder('Nombre de usuario').fill(u);
    await page.locator('input[type=password]').fill(p);
    await page.getByRole('button', { name: /Iniciar sesión/ }).click();
  };
  try {
    await paso('fixture: un admin de prueba', async () => {
      const [u] = await sql`INSERT INTO usuario (username, password_hash) VALUES (${jefe}, ${await hashearPassword('Password123!')}) RETURNING id`;
      await sql`INSERT INTO permiso_capacidad (usuario_id, capacidad) VALUES (${u.id}, 'admin')`;
    });
    await paso('el admin crea un usuario de taller desde "Usuarios"', async () => {
      await entrar(jefe, 'Password123!');
      await page.waitForURL((x) => !x.pathname.startsWith('/login'));
      await page.goto(B + '/usuarios');
      await page.getByRole('button', { name: 'Nuevo usuario' }).click();
      await page.getByLabel('Usuario').fill(nuevo);
      await page.getByLabel('Contraseña inicial').fill('Inicial123');
      await page.getByRole('button', { name: 'Taller', exact: true }).click();
      await page.getByRole('button', { name: 'Crear usuario' }).click();
      await page.getByText(`Usuario ${nuevo} creado.`).waitFor();
      await page.getByPlaceholder(/Buscar por usuario/).fill(nuevo);
      await page.getByText(nuevo, { exact: true }).waitFor();
    });
    await paso('el usuario nuevo entra y cambia su clave desde "Mi clave"', async () => {
      await entrar(nuevo, 'Inicial123');
      await page.waitForURL(/\/mi-trabajo/);
      await page.getByTitle('Cambiar mi contraseña').click();
      await page.getByLabel('Contraseña actual').fill('Inicial123');
      await page.getByLabel('Contraseña nueva').fill('Propia4567');
      await page.getByLabel('Repetir la nueva').fill('Propia4567');
      await page.getByRole('button', { name: 'Cambiar', exact: true }).click();
      await page.getByText('Tu contraseña cambió.').waitFor();
      await entrar(nuevo, 'Propia4567');
      await page.waitForURL(/\/mi-trabajo/);
    });
    await paso('el admin lo desactiva y ya no puede entrar', async () => {
      await entrar(jefe, 'Password123!');
      await page.waitForURL((x) => !x.pathname.startsWith('/login'));
      await page.goto(B + '/usuarios?q=' + nuevo);
      page.once('dialog', (d) => void d.accept());
      await page.getByRole('button', { name: `Desactivar ${nuevo}` }).click();
      await page.getByText(`${nuevo} desactivado.`).waitFor();
      await entrar(nuevo, 'Propia4567');
      await page.getByText(/Credenciales inválidas|inválid/i).first().waitFor();
    });
    if (errores.length) throw new Error(errores.join(' | '));
    console.log(`\n>>> RECORRIDO USUARIOS EN VERDE: ${n}/${n} PASOS OK <<<\n`);
  } finally {
    await browser.close();
    await sql`UPDATE usuario SET activo = false WHERE username IN (${jefe}, ${nuevo})`;
    await sql.end({ timeout: 3 });
  }
})().catch(() => process.exit(1));
