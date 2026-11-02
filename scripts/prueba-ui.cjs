/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console, process */
/**
 * Recorrido de la interfaz con Playwright (15 pasos E2 + E3).
 * Uso: node scripts/prueba-ui.cjs
 */
const { chromium } = require('playwright');
const postgres = require('postgres');
const { config } = require('dotenv');
const path = require('node:path');
const fs = require('node:fs');

config({ path: ['.env', '.env.test'] });

const B = process.env.BASE_URL || 'https://sistema-afull-v2-api.vercel.app';
const dbUrl = process.env.DATABASE_URL_ADMIN;

(async () => {
  if (!dbUrl) throw new Error('DATABASE_URL_ADMIN requerida para crear usuario.');
  const sql = postgres(dbUrl, { max: 1, prepare: false });

  const { hashearPassword } = await import('../apps/api/dist/modules/auth/password.js');
  const sufijo = Math.random().toString(36).slice(2, 8);
  const username = `zz_test_u_${sufijo}`;
  const password = 'Password123!';
  const passHash = await hashearPassword(password);

  console.log('================================================================');
  console.log(`RECORRIDO PLAYWRIGHT EN NAVEGADOR (15 PASOS)`);
  console.log(`Destino: ${B}`);
  console.log('================================================================\n');

  const [u] = await sql`
    INSERT INTO usuario (username, password_hash, activo)
    VALUES (${username}, ${passHash}, true) RETURNING id
  `;
  await sql`INSERT INTO permiso_capacidad (usuario_id, capacidad) VALUES (${u.id}, 'comercial'), (${u.id}, 'admin')`;
  console.log(`[SETUP OK] Usuario creado: ${username}`);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);

  const problemas = [];
  const avisosReact = [];
  page.on('console', (m) => {
    const txt = m.text();
    if (m.type() === 'error') problemas.push('CONSOLE: ' + txt);
    if (txt.includes('Cannot update a component while rendering a different component')) {
      avisosReact.push(txt);
    }
  });
  page.on('pageerror', (e) => problemas.push('PAGEERROR: ' + e.message));
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 400 && !r.url().includes('/transicionar')) {
      problemas.push(`HTTP ${r.status()} ${r.request().method()} ${r.url()}`);
    }
  });

  const ssDir = path.join(process.cwd(), '.tmp-ui');
  if (!fs.existsSync(ssDir)) fs.mkdirSync(ssDir, { recursive: true });

  const paso = async (n, fn) => {
    try {
      await fn();
      console.log('OK  ', n);
    } catch (e) {
      console.log('FALLA', n, '->', e.message.split('\n')[0]);
      await page.screenshot({ path: path.join(ssDir, `${n.replace(/\W+/g, '_')}.png`) });
      throw e;
    }
  };

  const nombre = `zz_test_cli_ui_${sufijo}`;

  try {
    // 1. Login
    await paso('1. login', async () => {
      await page.goto(B + '/clientes');
      await page.waitForURL(/login/);
      await page.getByPlaceholder('Nombre de usuario').fill(username);
      await page.locator('input[type=password]').fill(password);
      await page.getByRole('button', { name: /Iniciar sesión/ }).click();
      await page.waitForURL(/\/clientes/);
    });

    // 2. Crear cliente (sin email, campo opcional vacío)
    await paso('2. crear cliente (sin email)', async () => {
      await page.getByRole('button', { name: /Nuevo Cliente/ }).click();
      await page.locator('#nombre, input[name=nombre]').first().fill(nombre);
      await page.getByRole('button', { name: /Guardar|Crear|Registrar/ }).last().click();
      await page.getByText(nombre).first().waitFor({ timeout: 6000 });
    });

    // 3. Buscar cliente (debounce 300 ms)
    await paso('3. buscar cliente (debounce)', async () => {
      await page.getByLabel('Buscar en la tabla').fill(nombre.slice(-6));
      await page.waitForURL(/q=/, { timeout: 4000 });
      await page.getByText(nombre).first().waitFor();
    });

    // 4. Editar cliente
    await paso('4. editar cliente', async () => {
      await page.getByRole('button', { name: `Editar ${nombre}` }).click();
      await page.locator('#edit-telefono').fill('0981123456');
      await page.getByRole('button', { name: /Guardar Cambios/ }).click();
      await page.getByText('0981123456').first().waitFor({ timeout: 6000 });
    });

    // 5. Abrir detalle
    await paso('5. abrir detalle', async () => {
      await page.locator('tbody tr', { hasText: nombre }).first().locator('td').nth(1).click();
      await page.waitForURL(/\/clientes\/[0-9a-f-]{36}/);
      await page.getByText('Sucursales (0)').waitFor();
    });

    // 6. Crear sucursal con GPS
    await paso('6. crear sucursal', async () => {
      await page.getByRole('button', { name: /Nueva Sucursal/ }).click();
      await page.locator('input[name=nombre]').last().fill('Casa Central');
      await page.getByRole('button', { name: /Guardar|Crear|Registrar/ }).last().click();
      await page.getByText('Sucursales (1)').waitFor({ timeout: 6000 });
    });

    // 7. Crear contacto
    await paso('7. crear contacto', async () => {
      await page.getByRole('button', { name: /Nuevo Contacto/ }).click();
      await page.locator('input[name=nombre]').last().fill('Ana Pérez');
      await page.getByRole('button', { name: /Guardar|Crear|Registrar/ }).last().click();
      await page.getByText('Contactos (1)').waitFor({ timeout: 6000 });
    });

    // 8. Crear marca
    await paso('8. crear marca', async () => {
      await page.getByRole('button', { name: /Nueva Marca/ }).click();
      await page.locator('input[name=nombre]').last().fill('MarcaX');
      await page.getByRole('button', { name: /Guardar|Crear|Registrar/ }).last().click();
      await page.getByText('Marcas (1)').waitFor({ timeout: 6000 });
    });

    // 9. Ver OTs del cliente
    await paso('9. ver OTs del cliente', async () => {
      await page.getByRole('link', { name: /Ver OTs/ }).click();
      await page.waitForURL(/\/ots\?.*clienteId=/);
    });

    // 10. Crear OT (opcionales vacíos)
    await paso('10. crear OT', async () => {
      await page.getByRole('button', { name: /Nueva OT|Nueva Orden/ }).click();
      const dlg = page.locator('[role=dialog]').last();
      await dlg.locator('input').first().fill(nombre.slice(0, 15));
      await page.waitForTimeout(800);
      await dlg.getByText(nombre).first().click();
      await dlg.locator('input[name=titulo]').fill('zz_test OT ui');
      await dlg.locator('input[type=date]').fill('2026-11-05');
      await dlg.getByRole('button', { name: /Crear|Guardar/ }).last().click();
      await page.getByText('zz_test OT ui').first().waitFor({ timeout: 6000 });
    });

    // 11. Fecha prometida
    await paso('11. fecha 05/11/2026 en lista', async () => {
      await page.getByText('05/11/2026').first().waitFor({ timeout: 4000 });
    });

    // 12. Abrir OT y transicionar a EN_DISENO
    await paso('12. abrir OT y transicionar a EN_DISENO', async () => {
      await page.locator('tbody tr', { hasText: 'zz_test OT ui' }).first().locator('td').nth(1).click();
      await page.waitForURL(/\/ots\/[0-9a-f-]{36}/);
      await page.getByRole('button', { name: /Avanzar Estado|Cambiar Estado|Transici/ }).first().click();
      await page.getByTestId('estado-opcion-EN_DISENO').click();
      await page.getByRole('button', { name: /Confirmar Transición/ }).click();
      await page.getByText('EN_DISENO').first().waitFor({ timeout: 6000 });
    });

    // 13. Cancelar sin motivo bloqueado
    await paso('13. cancelar sin motivo bloqueado', async () => {
      await page.getByRole('button', { name: /Avanzar Estado|Cambiar Estado|Transici/ }).first().click();
      await page.getByTestId('estado-opcion-CANCELADO').click();
      await page.getByRole('button', { name: /Confirmar Transición/ }).click();
      await page.getByTestId('error-comentario').waitFor({ timeout: 3000 });
      await page.keyboard.press('Escape');
    });

    // 14. Recargar detalle OT
    await paso('14. recargar detalle OT', async () => {
      await page.reload();
      await page.getByText('zz_test OT ui').first().waitFor({ timeout: 6000 });
      await page.getByText('05/11/2026').first().waitFor({ timeout: 4000 });
    });

    // 15. Desactivar cliente con OT abierta
    await paso('15. desactivar cliente con OT abierta', async () => {
      await page.goto(B + '/clientes?q=' + nombre);
      await page.getByRole('button', { name: `Desactivar ${nombre}` }).click();
      await page.getByRole('button', { name: /Confirmar Desactivación/ }).click();
      await page.getByText(/OT\(s\) abierta/).first().waitFor({ timeout: 6000 });
    });

    console.log('\n--- Resumen de ejecución ---');
    console.log('Problemas observados:', problemas.length ? problemas.join('\n') : '(ninguno)');
    console.log('Avisos React "Cannot update a component":', avisosReact.length ? avisosReact.join('\n') : '(ninguno)');
    console.log('\n>>> 15 DE 15 PASOS EN NAVEGADOR COMPLETADOS EXITOSAMENTE <<<');
  } finally {
    await browser.close();
    if (u?.id) {
      await sql`UPDATE usuario SET activo = false WHERE id = ${u.id}`;
      await sql`DELETE FROM sesion WHERE usuario_id = ${u.id}`;
      console.log(`[CLEANUP OK] Usuario ${username} desactivado.`);
    }
    await sql.end();
  }
})();
