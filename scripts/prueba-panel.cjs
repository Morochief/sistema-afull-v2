/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console, process */
/**
 * Recorrido CA-14.7 (Loop 14): el montador marca entrada → Gerardo lo ve "sin tarea" en el Panel → le asigna una tarea
 * en una OT con la hoja en borrador (la activa en el mismo paso) → el montador la ve en Mi trabajo y la inicia → pasa a "Trabajando".
 * Uso: node scripts/prueba-panel.cjs   (BASE_URL y CHROMIUM_PATH opcionales)
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
  const usuarios = [`zz_test_gerardo14_${s}`, `zz_test_mont14_${s}`];
  const nombreOp = `zz_test_Montador14 ${s}`;
  const opciones = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : process.platform === 'win32' ? { channel: 'chrome' } : {};
  const browser = await chromium.launch(opciones);
  const cg = await browser.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'America/Asuncion' });
  const co = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Asuncion',
    geolocation: { latitude: -25.3206, longitude: -57.6242 }, permissions: ['geolocation'] });
  const pg = await cg.newPage();
  const po = await co.newPage();
  pg.setDefaultTimeout(15000);
  po.setDefaultTimeout(15000);
  const errores = [];
  for (const p of [pg, po]) p.on('pageerror', (e) => errores.push(e.message));
  let n = 0;
  let personaId;
  let codigo;
  const paso = async (t, fn) => {
    n += 1;
    try { await fn(); console.log('OK  ', n, t); } catch (e) {
      console.log('FALLA', n, t, '->', e.message.split('\n')[0]);
      await pg.screenshot({ path: `prueba-panel-falla-${n}-gerardo.png` });
      await po.screenshot({ path: `prueba-panel-falla-${n}-montador.png` });
      throw e;
    }
  };
  const entrar = async (page, user, destino) => {
    await page.goto(B + '/login');
    await page.getByPlaceholder('Nombre de usuario').fill(user);
    await page.locator('input[type=password]').fill('Password123!');
    await page.getByRole('button', { name: /Iniciar sesión/ }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'));
    if (destino) await page.goto(B + destino);
  };
  const tarjeta = (bloque) => pg.getByTestId(`${bloque}-${personaId}`);
  try {
    await paso('fixture: Gerardo (oficina), un montador con persona y una OT con la hoja en borrador', async () => {
      const hash = await hashearPassword('Password123!');
      const [g] = await sql`INSERT INTO usuario (username, password_hash) VALUES (${usuarios[0]}, ${hash}) RETURNING id`;
      await sql`INSERT INTO permiso_capacidad (usuario_id, capacidad) VALUES (${g.id}, 'comercial')`;
      const [p] = await sql`INSERT INTO persona (nombre, ci) VALUES (${nombreOp}, ${'P14' + s}) RETURNING id`;
      personaId = p.id;
      const [m] = await sql`INSERT INTO usuario (username, password_hash, persona_id) VALUES (${usuarios[1]}, ${hash}, ${p.id}) RETURNING id`;
      await sql`INSERT INTO permiso_capacidad (usuario_id, capacidad) VALUES (${m.id}, 'montaje')`;
      const [c] = await sql`INSERT INTO cliente (codigo, nombre) VALUES (${'C14-' + s}, ${'zz_test Farmacia14 ' + s}) RETURNING id`;
      codigo = `OT-Z14-${s}`;
      await sql`INSERT INTO orden_trabajo (codigo_ot, cliente_id, titulo, creado_por, hoja_estado, estado)
                VALUES (${codigo}, ${c.id}, ${'zz_test vinilos ' + s}, ${g.id}, 'BORRADOR', 'EN_TALLER')`;
      await entrar(pg, usuarios[0], '/panel');
      await pg.getByRole('heading', { name: 'Panel' }).waitFor();
    });
    await paso('Gerardo lo ve en "No marcaron entrada"', async () => {
      await pg.getByRole('button', { name: `Asignar tarea a ${nombreOp}` }).waitFor();
      if (await tarjeta('sintarea').count()) throw new Error('ya figura como presente');
    });
    await paso('el montador marca entrada en el celular → Gerardo lo ve "sin tarea", sin nada para hoy', async () => {
      await entrar(po, usuarios[1], '/calle');
      await po.getByRole('button', { name: 'Marcar entrada', exact: true }).click();
      await po.getByText(/Entrada registrada\./).waitFor();
      await pg.reload();
      await tarjeta('sintarea').getByText('No tiene nada para hoy').waitFor();
    });
    await paso('Gerardo le asigna una tarea en la OT (hoja en borrador, la activa en el mismo paso)', async () => {
      await tarjeta('sintarea').getByRole('button', { name: /Asignar tarea/ }).click();
      await pg.getByLabel('OT', { exact: true }).fill(codigo);
      await pg.getByRole('button', { name: new RegExp(codigo) }).click();
      const activar = pg.getByLabel(/activarla para que la vea ya/);
      if (!(await activar.isChecked())) throw new Error('"Activar la hoja" no viene tildado');
      await pg.getByLabel(/Qué hay que hacer/).fill('zz_test colocar vinilo en vidriera');
      await pg.getByLabel(/Tiempo estimado/).fill('45');
      await pg.getByRole('button', { name: 'Asignar', exact: true }).click();
      await pg.getByText(`Tarea asignada: ${nombreOp} ya la ve en Mi trabajo.`).waitFor();
      await tarjeta('sintarea').getByText('1 tarea para hoy sin empezar').waitFor();
    });
    await paso('el montador la ve en Mi trabajo y la inicia → Gerardo lo ve "Trabajando" en esa OT', async () => {
      await po.goto(B + '/mi-trabajo');
      const t = po.locator('div.rounded-md', { hasText: 'zz_test colocar vinilo en vidriera' }).filter({ has: po.getByRole('button', { name: /Iniciar Trabajo/ }) }).last();
      await t.getByRole('button', { name: /Iniciar Trabajo/ }).click();
      await po.getByRole('button', { name: /Pausar/ }).first().waitFor();
      await pg.reload();
      await tarjeta('trabajando').getByText(codigo).waitFor();
      await tarjeta('trabajando').getByText('zz_test colocar vinilo en vidriera').waitFor();
      const [h] = await sql`SELECT hoja_estado FROM orden_trabajo WHERE codigo_ot = ${codigo}`;
      if (h.hoja_estado !== 'ACTIVA') throw new Error('la hoja quedó ' + h.hoja_estado);
    });
    if (errores.length) throw new Error(errores.join(' | '));
    console.log(`\n>>> RECORRIDO PANEL DE GERARDO (CA-14.7) EN VERDE: ${n}/${n} PASOS OK <<<\n`);
  } finally {
    await browser.close();
    if (personaId) {
      await sql`UPDATE tarea_intervalo SET hora_fin = greatest(clock_timestamp(), hora_inicio), motivo_cierre = 'FIN' WHERE hora_fin IS NULL AND persona_id = ${personaId}`;
      await sql`UPDATE persona SET activo = false WHERE id = ${personaId}`;
    }
    for (const u of usuarios) await sql`UPDATE usuario SET activo = false WHERE username = ${u}`;
    await sql.end({ timeout: 3 });
  }
})().catch(() => process.exit(1));
