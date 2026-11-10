/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console, process */
/**
 * Recorrido CA-11.7 (Loop 11, hoja de ruta de Gerardo):
 * Gerardo arma la hoja en Borrador y le agrega a Edu una tarea para hoy (3 m2). Edu no la ve.
 * Gerardo la manda por WhatsApp (mensaje con ⛔Edu⛔) y queda Activa. Edu la ve en "Para hoy" con "3 m2".
 * Cerrar la hoja con la tarea pendiente se rechaza.
 * Uso: node scripts/prueba-hoja-ruta-ot.cjs   (BASE_URL y CHROMIUM_PATH opcionales)
 */
const { chromium } = require('playwright');
const postgres = require('postgres');
const { config } = require('dotenv');

config({ path: ['.env', '.env.test'] });
const B = process.env.BASE_URL || 'http://localhost:5173';
const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(new Date());

(async () => {
  const sql = postgres(process.env.DATABASE_URL_ADMIN, { max: 1, prepare: false });
  const { hashearPassword } = await import('../apps/api/dist/modules/auth/password.js');
  const s = Math.random().toString(36).slice(2, 7);
  const ger = `zz_test_ger11_${s}`;
  const edu = `zz_test_edu11_${s}`;
  const nombreEdu = `zz_test_Edu ${s}`;
  const tareaTxt = `zz_test colocar vinilo ${s}`;
  const opciones = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : process.platform === 'win32' ? { channel: 'chrome' } : {};
  const browser = await chromium.launch(opciones);
  const pg = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const pe = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
  const errores = [];
  for (const p of [pg, pe]) { p.setDefaultTimeout(12000); p.on('pageerror', (e) => errores.push(e.message)); }
  let n = 0;
  const personas = [];
  let otId;
  const paso = async (t, fn) => {
    n += 1;
    try { await fn(); console.log('OK  ', n, t); } catch (e) {
      console.log('FALLA', n, t, '->', e.message.split('\n')[0]);
      await pg.screenshot({ path: `prueba-hoja-falla-${n}-gerardo.png` });
      await pe.screenshot({ path: `prueba-hoja-falla-${n}-edu.png` });
      throw e;
    }
  };
  const login = async (page, user, destino) => {
    await page.goto(B + '/login');
    await page.getByPlaceholder('Nombre de usuario').fill(user);
    await page.locator('input[type=password]').fill('Password123!');
    await page.getByRole('button', { name: /Iniciar sesión/ }).click();
    await page.waitForURL(destino);
  };
  try {
    await paso('fixture: Gerardo (comercial), Edu (taller) y una OT nueva en borrador', async () => {
      const hash = await hashearPassword('Password123!');
      const usuario = async (username, cap, nombre, ci) => {
        const [u] = await sql`INSERT INTO usuario (username, password_hash) VALUES (${username}, ${hash}) RETURNING id`;
        await sql`INSERT INTO permiso_capacidad (usuario_id, capacidad) VALUES (${u.id}, ${cap})`;
        const [p] = await sql`INSERT INTO persona (nombre, ci) VALUES (${nombre}, ${ci}) RETURNING id`;
        personas.push(p.id);
        await sql`UPDATE usuario SET persona_id = ${p.id} WHERE id = ${u.id}`;
        return u.id;
      };
      const gId = await usuario(ger, 'comercial', `zz_test_Gerardo ${s}`, 'G11' + s);
      await usuario(edu, 'taller', nombreEdu, 'E11' + s);
      const [c] = await sql`INSERT INTO cliente (codigo, nombre) VALUES (${'C11-' + s}, ${'zz_test_cli11_' + s}) RETURNING id`;
      const [ot] = await sql`INSERT INTO orden_trabajo (codigo_ot, cliente_id, titulo, creado_por, hoja_estado)
                             VALUES (${'OT11-' + s}, ${c.id}, ${'zz_test vidriera ' + s}, ${gId}, 'BORRADOR') RETURNING id`;
      otId = ot.id;
      await login(pg, ger, /\/inicio/);
      await login(pe, edu, /\/mi-trabajo/);
    });
    await paso('Gerardo abre la OT: la hoja está en Borrador', async () => {
      await pg.goto(`${B}/ots/${otId}`);
      await pg.getByTestId('estado-hoja').filter({ hasText: 'Borrador' }).waitFor();
    });
    await paso('Gerardo agrega la tarea de Edu para hoy: 3 m2, 90 min', async () => {
      await pg.getByRole('button', { name: /Agregar Tarea/ }).click();
      await pg.locator('#th-persona').selectOption({ label: nombreEdu });
      await pg.locator('#th-desc').fill(tareaTxt);
      await pg.locator('#th-dia').fill(hoy);
      await pg.locator('#th-min').fill('90');
      await pg.locator('#th-cant').fill('3');
      await pg.locator('#th-uni').fill('m2');
      await pg.getByRole('button', { name: 'Agregar', exact: true }).click();
      await pg.getByTestId('hoja-ruta-ot').getByText(tareaTxt).waitFor();
      await pg.getByTestId('hoja-ruta-ot').getByText(`⛔ ${nombreEdu}`).waitFor();
    });
    await paso('Edu todavía no la ve (hoja en borrador)', async () => {
      await pe.reload();
      await pe.getByRole('heading', { name: /Mis tareas/ }).waitFor();
      if (await pe.getByText(tareaTxt).count()) throw new Error('Edu ve una tarea de una hoja en borrador');
    });
    await paso('Enviar por WhatsApp: mensaje con ⛔Edu⛔ y la cantidad; la hoja queda Activa', async () => {
      await pg.getByRole('button', { name: /Enviar por WhatsApp/ }).click();
      const dlg = pg.getByRole('dialog');
      await dlg.getByText(`⛔${nombreEdu}⛔`, { exact: false }).waitFor();
      await dlg.getByText('(Cant: 3 m2)', { exact: false }).waitFor();
      await dlg.getByText('*Hoja de Ruta —', { exact: false }).waitFor();
      await pg.keyboard.press('Escape');
      await pg.getByTestId('estado-hoja').filter({ hasText: 'Activa' }).waitFor();
    });
    await paso('Edu la ve en "Para hoy" con "3 m2"', async () => {
      await pe.reload();
      await pe.getByText('Para hoy').waitFor();
      await pe.getByText(tareaTxt).waitFor();
      await pe.getByText(/3 m2/).first().waitFor();
    });
    await paso('Cerrar con la tarea pendiente: rechazado, sigue Activa', async () => {
      await pg.getByRole('button', { name: /Cerrar/ }).first().click();
      await pg.getByText(/pendiente|en curso|sin terminar/i).first().waitFor();
      await pg.getByTestId('estado-hoja').filter({ hasText: 'Activa' }).waitFor();
      const [o] = await sql`SELECT hoja_estado FROM orden_trabajo WHERE id = ${otId}`;
      if (o.hoja_estado !== 'ACTIVA') throw new Error(`hoja_estado = ${o.hoja_estado}`);
    });
    if (errores.length) throw new Error(errores.join(' | '));
    console.log(`\n>>> RECORRIDO HOJA DE RUTA (CA-11.7) EN VERDE: ${n}/${n} PASOS OK <<<\n`);
  } finally {
    await browser.close();
    for (const id of personas) await sql`UPDATE persona SET activo = false WHERE id = ${id}`;
    await sql`UPDATE usuario SET activo = false WHERE username IN (${ger}, ${edu})`;
    await sql.end({ timeout: 3 });
  }
})().catch(() => process.exit(1));
