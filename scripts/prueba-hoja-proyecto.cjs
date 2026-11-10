/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console, process, fetch */
/**
 * Recorrido L4.E5: un admin (como Gerardo) arma la hoja de ruta y agrega un proyecto de 3 locales de una vez;
 * la hoja muestra las 3 paradas en orden y el aviso dice cuántas entraron. Repetirlo avisa que no falta ninguna.
 * Uso: node scripts/prueba-hoja-proyecto.cjs   (BASE_URL y CHROMIUM_PATH opcionales)
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
  const gerardo = `zz_test_ger45_${s}`;
  const opciones = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : process.platform === 'win32' ? { channel: 'chrome' } : {};
  const browser = await chromium.launch(opciones);
  const page = await (await browser.newContext()).newPage();
  page.setDefaultTimeout(12000);
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  let n = 0;
  const paso = async (t, fn) => {
    n += 1;
    try { await fn(); console.log('OK  ', n, t); } catch (e) {
      console.log('FALLA', n, t, '->', e.message.split('\n')[0]);
      await page.screenshot({ path: `prueba-hoja-proyecto-falla-${n}.png` });
      throw e;
    }
  };
  const api = (method, path, body) => page.evaluate(async ([m, p, b]) => {
    const r = await fetch(p, { method: m, headers: b ? { 'content-type': 'application/json' } : {}, body: b ? JSON.stringify(b) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${m} ${p} ${r.status} ${JSON.stringify(j)}`);
    return j;
  }, [method, path, body]);
  let proyecto, ots, hoja;
  try {
    await paso('fixture: Gerardo admin y un proyecto aprobado de 3 locales', async () => {
      const [u] = await sql`INSERT INTO usuario (username, password_hash) VALUES (${gerardo}, ${await hashearPassword('Password123!')}) RETURNING id`;
      await sql`INSERT INTO permiso_capacidad (usuario_id, capacidad) VALUES (${u.id}, 'admin')`;
      await page.goto(B + '/login');
      await page.getByPlaceholder('Nombre de usuario').fill(gerardo);
      await page.locator('input[type=password]').fill('Password123!');
      await page.getByRole('button', { name: /Iniciar sesión/ }).click();
      await page.waitForURL(/\/inicio/);
      const c = await api('POST', '/api/clientes', { nombre: `zz_test_cli45_${s}` });
      const p = await api('POST', '/api/presupuestos', { clienteId: c.id, titulo: `zz_test campaña ${s}`, margenPct: 0 });
      for (const n of ['Centro', 'Luque', 'San Lorenzo']) {
        const l = await api('POST', `/api/clientes/${c.id}/sucursales`, { nombre: n, gpsLat: -25.3, gpsLng: -57.6 });
        await api('POST', `/api/presupuestos/${p.id}/items`, { sucursalId: l.id, concepto: 'MATERIAL', descripcion: 'Lona', cantidad: 1, unidad: 'UNIDAD', precioUnitarioGs: 100000 });
      }
      await api('POST', `/api/presupuestos/${p.id}/enviar`, { desde: 'BORRADOR' });
      const ap = await api('POST', `/api/presupuestos/${p.id}/aprobar`, { desde: 'ENVIADO', comentario: 'zz_test OC' });
      proyecto = ap.proyecto;
      ots = ap.ots.map((o) => o.codigo_ot).sort();
    });
    await paso('arma la hoja de ruta sin vehículo', async () => {
      hoja = await api('POST', '/api/hojas-ruta', { fecha: '2030-02-01', descripcion: `zz_test salida ${s}` });
      await page.goto(`${B}/hojas-ruta/${hoja.id}`);
      await page.getByText('Paradas (0)').waitFor();
      await page.getByText('sin vehículo').waitFor();
    });
    await paso('elige el proyecto y lo agrega entero: 3 paradas en orden', async () => {
      await page.getByLabel('Proyecto').selectOption({ value: proyecto.id });
      await page.getByRole('button', { name: 'Agregar proyecto' }).click();
      await page.getByText('Se agregaron 3 paradas.').waitFor();
      await page.getByText('Paradas (3)').waitFor();
      for (const [i, codigo] of ots.entries()) await page.getByText(`${i + 1}. ${codigo}`, { exact: false }).waitFor();
    });
    await paso('repetirlo avisa que no falta ninguna y no duplica', async () => {
      await page.getByLabel('Proyecto').selectOption({ value: proyecto.id });
      await page.getByRole('button', { name: 'Agregar proyecto' }).click();
      await page.getByText('no tiene OTs abiertas que falten').waitFor();
      await page.getByText('Paradas (3)').waitFor();
    });
    if (errores.length) throw new Error(errores.join(' | '));
    console.log(`\n>>> RECORRIDO HOJA + PROYECTO EN VERDE: ${n}/${n} PASOS OK <<<\n`);
  } finally {
    await browser.close();
    await sql`UPDATE usuario SET activo = false WHERE username = ${gerardo}`;
    await sql.end({ timeout: 3 });
  }
})().catch(() => process.exit(1));
