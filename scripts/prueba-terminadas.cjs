/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console, process */
/**
 * Recorrido CA-15.6 (Loop 15), en el celular: Edu tiene una tarea pausada con 30 min de hoy, la reanuda y la finaliza;
 * en Mi trabajo → Terminadas la ve con su tiempo (30 min y algo) y "Esta semana trabajaste" la incluye.
 * Uso: node scripts/prueba-terminadas.cjs   (BASE_URL y CHROMIUM_PATH opcionales)
 */
const { chromium } = require('playwright');
const postgres = require('postgres');
const { randomUUID } = require('node:crypto');
const { config } = require('dotenv');

config({ path: ['.env', '.env.test'] });
const B = process.env.BASE_URL || 'http://localhost:5173';

(async () => {
  const sql = postgres(process.env.DATABASE_URL_ADMIN, { max: 1, prepare: false });
  const { hashearPassword } = await import('../apps/api/dist/modules/auth/password.js');
  const s = Math.random().toString(36).slice(2, 7);
  const edu = `zz_test_edu15_${s}`;
  const desc = `zz_test imprimir vinilo ${s}`;
  const opciones = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : process.platform === 'win32' ? { channel: 'chrome' } : {};
  const browser = await chromium.launch(opciones);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Asuncion' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  let n = 0;
  let personaId;
  const paso = async (t, fn) => {
    n += 1;
    try { await fn(); console.log('OK  ', n, t); } catch (e) {
      console.log('FALLA', n, t, '->', e.message.split('\n')[0]);
      await page.screenshot({ path: `prueba-terminadas-falla-${n}.png` });
      throw e;
    }
  };
  try {
    await paso('fixture: Edu con una tarea pausada que ya tiene 30 min de hoy', async () => {
      const [u] = await sql`INSERT INTO usuario (username, password_hash) VALUES (${edu}, ${await hashearPassword('Password123!')}) RETURNING id`;
      await sql`INSERT INTO permiso_capacidad (usuario_id, capacidad) VALUES (${u.id}, 'taller')`;
      const [p] = await sql`INSERT INTO persona (nombre, ci) VALUES (${'zz_test_Edu15 ' + s}, ${'T15' + s}) RETURNING id`;
      personaId = p.id;
      await sql`UPDATE usuario SET persona_id = ${p.id} WHERE id = ${u.id}`;
      const [c] = await sql`INSERT INTO cliente (codigo, nombre) VALUES (${'C15-' + s}, ${'zz_test Kiosco15 ' + s}) RETURNING id`;
      const [ot] = await sql`INSERT INTO orden_trabajo (codigo_ot, cliente_id, titulo, creado_por) VALUES (${'OT-Z15-' + s}, ${c.id}, 'zz_test vinilo', ${u.id}) RETURNING id`;
      const [t] = await sql`INSERT INTO tarea (orden_trabajo_id, persona_asignada_id, tipo, descripcion, orden_secuencia, estado, creado_por, cantidad, unidad)
                            VALUES (${ot.id}, ${p.id}, 'TALLER_IMPRESION', ${desc}, 1, 'PAUSADA', ${u.id}, 4, 'm2') RETURNING id`;
      await sql`INSERT INTO tarea_intervalo (tarea_id, persona_id, hora_inicio, hora_fin, motivo_cierre, clave_idempotencia)
                VALUES (${t.id}, ${p.id}, now() - interval '50 minutes', now() - interval '20 minutes', 'PAUSA', ${randomUUID()})`;
      await page.goto(B + '/login');
      await page.getByPlaceholder('Nombre de usuario').fill(edu);
      await page.locator('input[type=password]').fill('Password123!');
      await page.getByRole('button', { name: /Iniciar sesión/ }).click();
      await page.waitForURL(/\/mi-trabajo/);
    });
    await paso('Terminadas todavía vacía', async () => {
      await page.getByRole('tab', { name: 'Terminadas' }).click();
      await page.getByText('No terminaste tareas en este período.').waitFor();
      await page.getByTestId('horas-periodo').getByText('30 min').waitFor();
    });
    await paso('reanuda y finaliza la tarea', async () => {
      await page.getByRole('tab', { name: 'Pendientes' }).click();
      await page.getByRole('button', { name: /Reanudar Trabajo/ }).click();
      await page.getByText('EN CURSO').waitFor();
      await page.getByRole('button', { name: /Finalizar/ }).click();
      await page.getByPlaceholder(/Ej: Terminadas todas las piezas/).fill('zz_test listo');
      await page.getByRole('button', { name: /Marcar como Listo/ }).click();
      await page.getByText(desc).waitFor({ state: 'detached' });
    });
    await paso('Terminadas: la ve con su tiempo, la OT, el cliente y la cantidad', async () => {
      await page.getByRole('tab', { name: 'Terminadas' }).click();
      const fila = page.locator('li', { hasText: desc });
      await fila.getByText('30 min').waitFor();
      await fila.getByText(`OT-Z15-${s}`).waitFor();
      await fila.getByText(/4 m2/).waitFor();
      await page.getByTestId('horas-periodo').getByText('Esta semana trabajaste').waitFor();
    });
    if (errores.length) throw new Error(errores.join(' | '));
    console.log(`\n>>> RECORRIDO TERMINADAS (CA-15.6) EN VERDE: ${n}/${n} PASOS OK <<<\n`);
  } finally {
    await browser.close();
    if (personaId) {
      await sql`UPDATE tarea_intervalo SET hora_fin = greatest(clock_timestamp(), hora_inicio), motivo_cierre = 'FIN' WHERE hora_fin IS NULL AND persona_id = ${personaId}`;
      await sql`UPDATE persona SET activo = false WHERE id = ${personaId}`;
    }
    await sql`UPDATE usuario SET activo = false WHERE username = ${edu}`;
    await sql.end({ timeout: 3 });
  }
})().catch(() => process.exit(1));
