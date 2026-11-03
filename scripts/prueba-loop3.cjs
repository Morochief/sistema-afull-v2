/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console, process */
/**
 * CA-3.10 — Recorrido del circuito comercial en navegador (Playwright):
 * presupuesto con 2 sucursales → enviar → nueva versión con 1 sucursal → aprobar con evidencia
 * → se abre la OT con su monto → la hoja de impresión muestra el total.
 *
 * Uso: node scripts/prueba-loop3.cjs   (BASE_URL opcional; CHROMIUM_PATH opcional)
 */
const { chromium } = require('playwright');
const postgres = require('postgres');
const { config } = require('dotenv');

config({ path: ['.env', '.env.test'] });
const B = process.env.BASE_URL || 'http://localhost:5173';

(async () => {
  const sql = postgres(process.env.DATABASE_URL_ADMIN, { max: 1, prepare: false });
  const { hashearPassword } = await import('../apps/api/dist/modules/auth/password.js');
  const s = Math.random().toString(36).slice(2, 8);
  const usuario = `zz_test_com3_${s}`;
  const password = 'Password123!';
  const opciones = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : process.platform === 'win32' ? { channel: 'chrome' } : {};
  const browser = await chromium.launch(opciones);
  const page = await browser.newPage();
  page.setDefaultTimeout(12000);
  const problemas = [];
  page.on('pageerror', (e) => problemas.push('PAGEERROR: ' + e.message));
  let uId = null;
  let clienteId = null;
  let n = 0;
  const paso = async (titulo, fn) => {
    n += 1;
    try {
      await fn();
      console.log('OK  ', n, titulo);
    } catch (e) {
      console.log('FALLA', n, titulo, '->', e.message.split('\n')[0]);
      await page.screenshot({ path: `prueba-loop3-falla-${n}.png` });
      throw e;
    }
  };

  try {
    await paso('fixtures: usuario comercial, cliente con 2 sucursales', async () => {
      const [u] = await sql`INSERT INTO usuario (username, password_hash) VALUES (${usuario}, ${await hashearPassword(password)}) RETURNING id`;
      uId = u.id;
      await sql`INSERT INTO permiso_capacidad (usuario_id, capacidad) VALUES (${u.id}, 'comercial')`;
      const [c] = await sql`INSERT INTO cliente (codigo, nombre) VALUES (${'Z3' + s}, ${'zz_test_cli3_' + s}) RETURNING id`;
      clienteId = c.id;
      await sql`INSERT INTO sucursal (cliente_id, nombre, gps_lat, gps_lng) VALUES (${c.id}, 'Luque', -25.27, -57.48), (${c.id}, 'Villa Elisa', -25.37, -57.59)`;
    });

    await paso('login comercial', async () => {
      await page.goto(B + '/login');
      await page.getByPlaceholder('Nombre de usuario').fill(usuario);
      await page.locator('input[type=password]').fill(password);
      await page.getByRole('button', { name: /Iniciar sesión/ }).click();
      await page.waitForURL(/\/clientes/);
    });

    await paso('crear presupuesto desde el menú', async () => {
      await page.getByRole('link', { name: /Presupuestos/ }).click();
      await page.getByRole('button', { name: /Nuevo Presupuesto/ }).click();
      await page.getByPlaceholder('Buscar cliente por nombre o RUC...').fill('zz_test_cli3_' + s);
      await page.getByText('zz_test_cli3_' + s).first().click();
      await page.locator('#pTitulo').fill('zz_test campaña ' + s);
      await page.getByRole('button', { name: /Crear Presupuesto/ }).click();
      await page.waitForURL(/\/presupuestos\/[0-9a-f-]{36}$/);
    });

    for (const [suc, precio] of [['Luque', '150.000'], ['Villa Elisa', '100.000']]) {
      await paso(`agregar ítem para ${suc}`, async () => {
        await page.getByRole('button', { name: /Agregar Ítem/ }).click();
        await page.locator('#iSucursal').selectOption({ label: suc });
        await page.locator('#iDescripcion').fill('Lona front ' + suc);
        await page.locator('#iPrecio').fill(precio);
        await page.getByRole('button', { name: /Guardar Ítem/ }).click();
        await page.getByText('Lona front ' + suc).waitFor();
      });
    }

    await paso('enviar: precio sin IVA congelado 357.143 (250.000 ÷ 0,70)', async () => {
      await page.getByRole('button', { name: /Enviar al cliente/ }).click();
      await page.getByRole('dialog').getByRole('button', { name: /^Enviar$/ }).click();
      await page.getByTestId('neto-presupuesto').filter({ hasText: '357.143' }).waitFor();
    });

    await paso('nueva versión y quitar Villa Elisa', async () => {
      await page.getByRole('button', { name: /Nueva versión/ }).click();
      await page.getByRole('dialog').getByRole('button', { name: /Crear versión/ }).click();
      await page.getByText(/v2/).first().waitFor();
      await page.locator('tr', { hasText: 'Villa Elisa' }).getByTitle('Quitar ítem').click();
      await page.getByTestId('neto-presupuesto').filter({ hasText: '214.286' }).waitFor();
    });

    await paso('enviar v2 y aprobar con evidencia → abre la OT', async () => {
      await page.getByRole('button', { name: /Enviar al cliente/ }).click();
      await page.getByRole('dialog').getByRole('button', { name: /^Enviar$/ }).click();
      await page.getByRole('button', { name: /^Aprobar$/ }).waitFor();
      await page.getByRole('button', { name: /^Aprobar$/ }).click();
      await page.locator('#accionComentario').fill('OC 4512 por WhatsApp');
      await page.getByRole('button', { name: /Aprobar y generar OTs/ }).click();
      await page.waitForURL(/\/ots\/[0-9a-f-]{36}$/);
      await page.getByText('Monto presupuestado:').waitFor();
      await page.getByText('Gs. 214.286').first().waitFor();
    });

    await paso('la hoja de impresión muestra el total', async () => {
      await page.getByRole('link', { name: /PRE-/ }).click();
      await page.waitForURL(/\/presupuestos\//);
      await page.getByRole('link', { name: /Imprimir/ }).click();
      await page.waitForURL(/\/imprimir$/);
      await page.getByText('PRESUPUESTO', { exact: true }).waitFor();
      await page.getByText('Gs. 214.286').first().waitFor();
    });

    if (problemas.length) throw new Error(problemas.join(' | '));
    console.log(`\n>>> RECORRIDO LOOP 3 (CA-3.10) EN VERDE: ${n}/${n} PASOS OK <<<\n`);
  } finally {
    await browser.close();
    if (uId) await sql`UPDATE usuario SET activo = false WHERE id = ${uId}`;
    if (clienteId) await sql`UPDATE cliente SET activo = false WHERE id = ${clienteId}`;
    await sql.end({ timeout: 3 });
  }
})().catch(() => process.exit(1));
