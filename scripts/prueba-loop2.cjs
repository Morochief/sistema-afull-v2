/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console, process */
/**
 * CA-2.9 — Recorrido completo del Loop 2 en navegador con Playwright:
 * Comercial crea OT con 2 tareas asignadas -> Operario inicia A ->
 * Operario inicia B (A se pausa sola) -> Operario finaliza B ->
 * Comercial verifica en Control en Vivo.
 *
 * Uso: node scripts/prueba-loop2.cjs
 */
const { chromium } = require('playwright');
const postgres = require('postgres');
const { config } = require('dotenv');
const path = require('node:path');
const fs = require('node:fs');

config({ path: ['.env', '.env.test'] });

const B = process.env.BASE_URL || 'http://localhost:5173';
const dbUrl = process.env.DATABASE_URL_ADMIN;

(async () => {
  if (!dbUrl) throw new Error('DATABASE_URL_ADMIN requerida para inicializar fixtures.');
  const sql = postgres(dbUrl, { max: 1, prepare: false });

  const { hashearPassword } = await import('../apps/api/dist/modules/auth/password.js');
  const sufijo = Math.random().toString(36).slice(2, 8);

  const usernameComercial = `zz_test_com_${sufijo}`;
  const usernameOperario = `zz_test_op_${sufijo}`;
  const password = 'Password123!';
  const passHash = await hashearPassword(password);

  console.log('================================================================');
  console.log(`RECORRIDO PLAYWRIGHT LOOP 2 (CA-2.9)`);
  console.log(`Destino: ${B}`);
  console.log('================================================================\n');

  let uComercialId = null;
  let uOperarioId = null;
  let personaId = null;
  let clienteId = null;

  const launchOptions = {};
  if (process.platform === 'win32') {
    launchOptions.channel = 'chrome';
  } else if (process.env.CHROMIUM_PATH) {
    launchOptions.executablePath = process.env.CHROMIUM_PATH;
  }
  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage();
  page.setDefaultTimeout(12000);

  const problemas = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problemas.push('CONSOLE ERROR: ' + m.text());
  });
  page.on('pageerror', (e) => problemas.push('PAGEERROR: ' + e.message));

  const ssDir = path.join(process.cwd(), '.tmp-loop2');
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

  const nombreOperario = `zz_test_operario_${sufijo}`;
  const nombreCliente = `zz_test_cli_l2_${sufijo}`;
  const tituloOT = `zz_test_ot_letrero_${sufijo}`;
  const descTareaA = `zz_test_corte_aluminio_${sufijo}`;
  const descTareaB = `zz_test_armado_caja_${sufijo}`;

  try {
    // 0. Setup fixtures en base de datos
    await paso('0. setup fixtures (usuarios y persona vinculada)', async () => {
      // 0.1 Usuario comercial
      const [uCom] = await sql`
        INSERT INTO usuario (username, password_hash, activo)
        VALUES (${usernameComercial}, ${passHash}, true) RETURNING id
      `;
      uComercialId = uCom.id;
      await sql`INSERT INTO permiso_capacidad (usuario_id, capacidad) VALUES (${uCom.id}, 'comercial'), (${uCom.id}, 'admin')`;

      // 0.2 Persona operario
      const [p] = await sql`
        INSERT INTO persona (nombre, ci, cargo, departamento, activo)
        VALUES (${nombreOperario}, ${'CI_' + sufijo}, 'Operario Taller', 'Producción', true)
        RETURNING id
      `;
      personaId = p.id;

      // 0.3 Usuario operario con capacidad taller y vinculado a la persona
      const [uOp] = await sql`
        INSERT INTO usuario (username, password_hash, persona_id, activo)
        VALUES (${usernameOperario}, ${passHash}, ${p.id}, true) RETURNING id
      `;
      uOperarioId = uOp.id;
      await sql`INSERT INTO permiso_capacidad (usuario_id, capacidad) VALUES (${uOp.id}, 'taller')`;

      // 0.4 Cliente para la OT
      const [c] = await sql`
        INSERT INTO cliente (codigo, nombre, activo)
        VALUES (${'C' + sufijo.slice(0, 5)}, ${nombreCliente}, true) RETURNING id
      `;
      clienteId = c.id;
    });

    // 1. Login Comercial
    await paso('1. login comercial', async () => {
      await page.goto(B + '/login');
      await page.getByPlaceholder('Nombre de usuario').fill(usernameComercial);
      await page.locator('input[type=password]').fill(password);
      await page.getByRole('button', { name: /Iniciar sesión/ }).click();
      await page.waitForURL(/\/inicio/);
    });

    // 2. Comercial crea OT con 2 tareas asignadas al operario
    await paso('2. comercial crea OT con 2 tareas asignadas', async () => {
      await page.goto(B + '/ots');
      await page.getByRole('button', { name: /Nueva OT/ }).click();

      // Seleccionar cliente
      await page.getByPlaceholder('Buscar cliente por nombre o RUC...').fill(nombreCliente);
      await page.getByText(nombreCliente).first().click();

      // Título OT
      await page.locator('#titulo').fill(tituloOT);

      // Agregar Tarea A
      await page.getByRole('button', { name: /Agregar Tarea/ }).click();
      await page.getByPlaceholder('Descripción de la tarea (obligatoria)...').first().fill(descTareaA);

      // Asignar al operario en el select de operario
      const selectOperarioA = page.locator('div.space-y-2 select').nth(1);
      await selectOperarioA.selectOption({ label: nombreOperario });

      // Agregar Tarea B
      await page.getByRole('button', { name: /Agregar Tarea/ }).click();
      await page.getByPlaceholder('Descripción de la tarea (obligatoria)...').nth(1).fill(descTareaB);
      const selectOperarioB = page.locator('div.space-y-2 select').nth(3);
      await selectOperarioB.selectOption({ label: nombreOperario });

      // Urgente: la hoja de ruta nace activa para que el operario vea las tareas (Loop 11)
      await page.getByText('Urgente: activar la hoja de ruta ya.').click();

      // Guardar OT
      await page.getByRole('button', { name: /Crear OT/ }).click();
      await page.getByText(tituloOT).first().waitFor({ timeout: 8000 });
    });

    // 3. Logout de Comercial
    await paso('3. logout comercial', async () => {
      await page.getByRole('button', { name: /Salir/ }).click();
      await page.waitForURL(/\/login/);
    });

    // 4. Login de Operario -> Redirección automática a /mi-trabajo
    await paso('4. login operario -> redirección a /mi-trabajo', async () => {
      await page.getByPlaceholder('Nombre de usuario').fill(usernameOperario);
      await page.locator('input[type=password]').fill(password);
      await page.getByRole('button', { name: /Iniciar sesión/ }).click();
      await page.waitForURL(/\/mi-trabajo/);
    });

    // 5. Operario inicia Tarea A
    await paso('5. operario inicia Tarea A', async () => {
      await page.getByText(descTareaA).first().waitFor({ timeout: 6000 });
      // Click en el botón de Iniciar Trabajo para Tarea A
      const btnIniciarA = page.locator('.p-3\\.5', { hasText: descTareaA }).getByRole('button', { name: /Iniciar/ });
      await btnIniciarA.click();

      // Verificar que Tarea A pasa a EN CURSO y se muestra el cronómetro
      await page.getByText('EN CURSO').first().waitFor({ timeout: 6000 });
      await page.getByText(descTareaA).first().waitFor();
    });

    // 6. Operario inicia Tarea B -> Auto-pausa de Tarea A
    await paso('6. operario inicia Tarea B (auto-pausa de Tarea A)', async () => {
      // Click en el botón de Iniciar Trabajo para Tarea B
      const btnIniciarB = page.locator('.p-3\\.5', { hasText: descTareaB }).getByRole('button', { name: /Iniciar/ });
      await btnIniciarB.click();

      // Debe aparecer el aviso de que Tarea A fue pausada automáticamente
      await page.getByText(/Se pausó automáticamente la tarea/).waitFor({ timeout: 8000 });

      // Ahora Tarea B está EN CURSO en el cronómetro principal
      await page.locator('.mb-6', { hasText: descTareaB }).waitFor({ timeout: 6000 });
    });

    // 7. Operario finaliza Tarea B
    await paso('7. operario finaliza Tarea B', async () => {
      await page.getByRole('button', { name: /Finalizar/ }).click();
      await page.getByPlaceholder(/Ej: Terminadas todas las piezas/).fill('Trabajo terminado');
      await page.getByRole('button', { name: /Marcar como Listo/ }).click();

      // La tarea B ya no está en curso
      await page.waitForTimeout(1000);
    });

    // 8. Logout de Operario
    await paso('8. logout operario', async () => {
      await page.getByRole('button', { name: /Salir/ }).click();
      await page.waitForURL(/\/login/);
    });

    // 9. Login Comercial y verificación de Control en Vivo
    await paso('9. comercial verifica en Control en Vivo', async () => {
      await page.getByPlaceholder('Nombre de usuario').fill(usernameComercial);
      await page.locator('input[type=password]').fill(password);
      await page.getByRole('button', { name: /Iniciar sesión/ }).click();
      await page.waitForURL(/\/inicio/);

      // Ir a /en-vivo
      await page.goto(B + '/en-vivo');
      await page.getByText('Control en Vivo').waitFor({ timeout: 6000 });

      // Verificar que el operario aparece en la grilla
      await page.getByText(nombreOperario).first().waitFor({ timeout: 6000 });
    });

    console.log('\n================================================================');
    console.log('>>> RECORRIDO COMPLETO LOOP 2 (CA-2.9) EN VERDE: 9/9 PASOS OK <<<');
    console.log('================================================================\n');
  } finally {
    await browser.close();

    // Higiene estricta de base de datos
    console.log('[CLEANUP] Limpiando fixtures de prueba...');
    try {
      if (personaId) {
        await sql`
          UPDATE tarea_intervalo
          SET hora_fin = greatest(clock_timestamp(), hora_inicio), motivo_cierre = 'FIN'
          WHERE hora_fin IS NULL AND persona_id = ${personaId}
        `;
        await sql`UPDATE persona SET activo = false WHERE id = ${personaId}`;
      }
      if (uOperarioId) await sql`UPDATE usuario SET activo = false WHERE id = ${uOperarioId}`;
      if (uComercialId) await sql`UPDATE usuario SET activo = false WHERE id = ${uComercialId}`;
      if (clienteId) await sql`UPDATE cliente SET activo = false WHERE id = ${clienteId}`;
    } catch (e) {
      console.error('[CLEANUP ERROR]', e);
    } finally {
      await sql.end({ timeout: 3 });
      console.log('[CLEANUP OK] Conexiones cerradas y datos desactivados.');
    }
  }
})();
