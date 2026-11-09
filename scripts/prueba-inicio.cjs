/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console, process, document, window, fetch */
/**
 * Recorrido del tablero de Inicio (Loop 10, CA-10.9): comercial entra y cae en /inicio; los totales de
 * la pantalla coinciden con la API; un indicador abre la lista filtrada; en el celular (375 px) nada se
 * sale de la pantalla ni se corta; un operario no ve Inicio en el menú y entra a /mi-trabajo.
 * Uso: node scripts/prueba-inicio.cjs   (BASE_URL y CHROMIUM_PATH opcionales)
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
  const sofi = `zz_test_sofi10_${s}`;
  const edu = `zz_test_edu10_${s}`;
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
      await page.screenshot({ path: `prueba-inicio-falla-${n}.png` });
      throw e;
    }
  };
  const entrar = async (u) => {
    await ctx.clearCookies();
    await page.goto(B + '/login').catch(() => page.goto(B + '/login'));
    await page.getByPlaceholder('Nombre de usuario').fill(u);
    await page.locator('input[type=password]').fill('Password123!');
    await page.getByRole('button', { name: /Iniciar sesión/ }).click();
  };
  const valorDe = (titulo) => page.locator('a', { hasText: titulo }).first().locator('div.font-mono').innerText();
  try {
    await paso('fixture: una usuaria comercial y un operario de taller', async () => {
      const hash = await hashearPassword('Password123!');
      for (const [u, cap] of [[sofi, 'comercial'], [edu, 'taller']]) {
        const [x] = await sql`INSERT INTO usuario (username, password_hash) VALUES (${u}, ${hash}) RETURNING id`;
        await sql`INSERT INTO permiso_capacidad (usuario_id, capacidad) VALUES (${x.id}, ${cap})`;
      }
    });
    await paso('comercial entra y cae en /inicio con el tablero', async () => {
      await entrar(sofi);
      await page.waitForURL(/\/inicio$/);
      await page.getByTestId('tablero-inicio').waitFor();
    });
    await paso('los totales de la pantalla coinciden con la API', async () => {
      const api = await page.evaluate(() => fetch('/api/inicio').then((r) => r.json()));
      const esperado = { 'Pendientes': api.ots_por_estado.PENDIENTE ?? 0, 'Pedidos nuevos': api.pedidos_nuevos_total, 'Diseños por verificar': api.disenos_por_verificar, 'Permisos pendientes': api.permisos_pendientes };
      for (const [t, v] of Object.entries(esperado)) {
        const enPantalla = Number(await valorDe(t));
        if (enPantalla !== v) throw new Error(`${t}: pantalla ${enPantalla}, API ${v}`);
      }
      await page.getByText(`OTs atrasadas (${api.atrasadas_total})`).waitFor();
    });
    await paso('el indicador "Pedidos nuevos" abre la bandeja filtrada', async () => {
      await page.locator('a', { hasText: 'Pedidos nuevos' }).first().click();
      await page.waitForURL(/\/pedidos\?estado=NUEVO/);
      await page.getByText('Pedidos del portal').waitFor();
    });
    await paso('celular 375 px: nada se sale de la pantalla ni se corta', async () => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(B + '/inicio');
      await page.getByTestId('tablero-inicio').waitFor();
      const r = await page.evaluate(() => {
        const cortados = [...document.querySelectorAll('[data-testid=tablero-inicio] div.font-mono')].filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent);
        return { ancho: document.documentElement.scrollWidth, pantalla: window.innerWidth, cortados };
      });
      if (r.ancho > r.pantalla) throw new Error(`desborde horizontal: ${r.ancho} > ${r.pantalla}`);
      if (r.cortados.length) throw new Error('montos cortados: ' + r.cortados.join(', '));
      await page.setViewportSize({ width: 1280, height: 900 });
    });
    await paso('un operario entra a /mi-trabajo y no ve Inicio en el menú', async () => {
      await entrar(edu);
      await page.waitForURL(/\/mi-trabajo/);
      if (await page.getByRole('link', { name: 'Inicio' }).count()) throw new Error('el operario ve Inicio');
    });
    if (errores.length) throw new Error(errores.join(' | '));
    console.log(`\n>>> RECORRIDO INICIO EN VERDE: ${n}/${n} PASOS OK <<<\n`);
  } finally {
    await browser.close();
    await sql`UPDATE usuario SET activo = false WHERE username IN (${sofi}, ${edu})`;
    await sql.end({ timeout: 3 });
  }
})().catch(() => process.exit(1));
