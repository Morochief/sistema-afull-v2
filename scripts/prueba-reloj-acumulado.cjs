/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console, process */
/**
 * Recorrido L2.E5 (lo que reportó el usuario): Edu inicia, trabaja unos segundos, pone "Pausa breve" y reanuda.
 * El reloj tiene que seguir desde lo acumulado, no volver a cero; la tarjeta pausada muestra "Llevás …".
 * Uso: node scripts/prueba-reloj-acumulado.cjs   (BASE_URL y CHROMIUM_PATH opcionales)
 */
const { chromium } = require('playwright');
const postgres = require('postgres');
const { config } = require('dotenv');

config({ path: ['.env', '.env.test'] });
const B = process.env.BASE_URL || 'http://localhost:5173';
const segundos = (txt) => txt.split(':').map(Number).reduce((a, n) => a * 60 + n, 0);

(async () => {
  const sql = postgres(process.env.DATABASE_URL_ADMIN, { max: 1, prepare: false });
  const { hashearPassword } = await import('../apps/api/dist/modules/auth/password.js');
  const s = Math.random().toString(36).slice(2, 7);
  const edu = `zz_test_edu25_${s}`;
  const opciones = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : process.platform === 'win32' ? { channel: 'chrome' } : {};
  const browser = await chromium.launch(opciones);
  const page = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
  page.setDefaultTimeout(12000);
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  let n = 0;
  let personaId;
  const paso = async (t, fn) => {
    n += 1;
    try { await fn(); console.log('OK  ', n, t); } catch (e) {
      console.log('FALLA', n, t, '->', e.message.split('\n')[0]);
      await page.screenshot({ path: `prueba-reloj-falla-${n}.png` });
      throw e;
    }
  };
  // El reloj grande de la tarjeta en curso (mismo selector con el código viejo y el nuevo).
  const reloj = async () => segundos(await page.locator('span.font-mono.text-2xl').first().innerText());
  try {
    await paso('fixture: Edu con una tarea de impresión asignada', async () => {
      const [u] = await sql`INSERT INTO usuario (username, password_hash) VALUES (${edu}, ${await hashearPassword('Password123!')}) RETURNING id`;
      await sql`INSERT INTO permiso_capacidad (usuario_id, capacidad) VALUES (${u.id}, 'taller')`;
      const [p] = await sql`INSERT INTO persona (nombre, ci) VALUES (${'zz_test_Edu ' + s}, ${'R25' + s}) RETURNING id`;
      personaId = p.id;
      await sql`UPDATE usuario SET persona_id = ${p.id} WHERE id = ${u.id}`;
      const [c] = await sql`INSERT INTO cliente (codigo, nombre) VALUES (${'CR25-' + s}, ${'zz_test_cli25_' + s}) RETURNING id`;
      const [ot] = await sql`INSERT INTO orden_trabajo (codigo_ot, cliente_id, titulo, creado_por) VALUES (${'OT25-' + s}, ${c.id}, ${'zz_test lona ' + s}, ${u.id}) RETURNING id`;
      await sql`INSERT INTO tarea (orden_trabajo_id, persona_asignada_id, tipo, descripcion, orden_secuencia, estado, creado_por)
                VALUES (${ot.id}, ${p.id}, 'TALLER_IMPRESION', ${'zz_test imprimir ' + s}, 1, 'PENDIENTE', ${u.id})`;
      await page.goto(B + '/login');
      await page.getByPlaceholder('Nombre de usuario').fill(edu);
      await page.locator('input[type=password]').fill('Password123!');
      await page.getByRole('button', { name: /Iniciar sesión/ }).click();
      await page.waitForURL(/\/mi-trabajo/);
    });
    await paso('inicia y trabaja 4 segundos', async () => {
      await page.getByRole('button', { name: /Iniciar Trabajo/ }).click();
      await page.getByText('EN CURSO').waitFor();
      await page.waitForTimeout(4200);
      if ((await reloj()) < 4) throw new Error(`el reloj marca ${await reloj()} s`);
    });
    const pausar = async () => {
      await page.getByRole('button', { name: /Pausar/ }).click();
      await page.getByText('Pausa breve').click();
      await page.getByRole('button', { name: 'Confirmar Pausa' }).click();
      await page.getByRole('button', { name: /Reanudar Trabajo/ }).waitFor();
    };
    await paso('Pausa breve', pausar);
    await paso('reanuda: el reloj sigue desde lo acumulado, no desde cero', async () => {
      await page.getByRole('button', { name: /Reanudar Trabajo/ }).click();
      await page.getByText('EN CURSO').waitFor();
      await page.waitForTimeout(1500);
      const t = await reloj();
      if (t < 4) throw new Error(`volvió a cero: marca ${t} s`);
    });
    await paso('pausada otra vez, la tarjeta dice cuánto lleva', async () => {
      await pausar();
      await page.getByText(/Llevás 00:0[5-9]/).waitFor();
    });
    if (errores.length) throw new Error(errores.join(' | '));
    console.log(`\n>>> RECORRIDO RELOJ ACUMULADO EN VERDE: ${n}/${n} PASOS OK <<<\n`);
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
