/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console, process */
/**
 * Recorrido CA-13.6 (Loop 13): Gerardo (admin, compu) abre las horas de Edu desde Personas: cierra con la hora real
 * el reloj que Edu se olvidó corriendo desde ayer a las 8 (paró a las 9) y le carga 2 h a mano (trabajó sin celular).
 * La OT queda con 3 h de mano de obra y el listado muestra quién corrigió y por qué.
 * Uso: node scripts/prueba-horas.cjs   (BASE_URL y CHROMIUM_PATH opcionales)
 */
const { chromium } = require('playwright');
const postgres = require('postgres');
const { config } = require('dotenv');

config({ path: ['.env', '.env.test'] });
const B = process.env.BASE_URL || 'http://localhost:5173';
const ayer = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(new Date(Date.now() - 86_400_000));

(async () => {
  const sql = postgres(process.env.DATABASE_URL_ADMIN, { max: 1, prepare: false });
  const { hashearPassword } = await import('../apps/api/dist/modules/auth/password.js');
  const s = Math.random().toString(36).slice(2, 7);
  const ger = `zz_test_ger13_${s}`;
  const nombre = `zz_test_Edu13 ${s}`;
  const opciones = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : process.platform === 'win32' ? { channel: 'chrome' } : {};
  const browser = await chromium.launch(opciones);
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'America/Asuncion' })).newPage();
  page.setDefaultTimeout(12000);
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  let n = 0;
  let personaId;
  let ot;
  const paso = async (t, fn) => {
    n += 1;
    try { await fn(); console.log('OK  ', n, t); } catch (e) {
      console.log('FALLA', n, t, '->', e.message.split('\n')[0]);
      await page.screenshot({ path: `prueba-horas-falla-${n}.png` });
      throw e;
    }
  };
  try {
    await paso('fixture: Edu con el reloj abierto desde ayer a las 8:00 y Gerardo (admin)', async () => {
      const [u] = await sql`INSERT INTO usuario (username, password_hash) VALUES (${ger}, ${await hashearPassword('Password123!')}) RETURNING id`;
      await sql`INSERT INTO permiso_capacidad (usuario_id, capacidad) VALUES (${u.id}, 'admin')`;
      const [p] = await sql`INSERT INTO persona (nombre, ci) VALUES (${nombre}, ${'H13' + s}) RETURNING id`;
      personaId = p.id;
      const [c] = await sql`INSERT INTO cliente (codigo, nombre) VALUES (${'C13-' + s}, ${'zz_test cli13 ' + s}) RETURNING id`;
      [ot] = await sql`INSERT INTO orden_trabajo (codigo_ot, cliente_id, titulo, creado_por) VALUES (${'OT13-' + s}, ${c.id}, 'zz_test lona', ${u.id}) RETURNING id, codigo_ot`;
      const [t] = await sql`INSERT INTO tarea (orden_trabajo_id, persona_asignada_id, tipo, descripcion, orden_secuencia, estado, creado_por)
                            VALUES (${ot.id}, ${p.id}, 'TALLER_IMPRESION', 'zz_test imprimir lona', 1, 'EN_CURSO', ${u.id}) RETURNING id`;
      await sql`INSERT INTO tarea_intervalo (tarea_id, persona_id, hora_inicio, clave_idempotencia) VALUES (${t.id}, ${p.id}, ${`${ayer}T08:00:00-03:00`}, gen_random_uuid())`;
      await page.goto(B + '/login');
      await page.getByPlaceholder('Nombre de usuario').fill(ger);
      await page.locator('input[type=password]').fill('Password123!');
      await page.getByRole('button', { name: /Iniciar sesión/ }).click();
      await page.waitForURL(/\/inicio/);
    });
    await paso('Personas → Horas de Edu: ve el reloj abierto', async () => {
      await page.goto(B + '/personas');
      await page.getByPlaceholder(/Buscar/).first().fill(nombre);
      await page.getByRole('button', { name: `Horas de ${nombre}` }).click();
      await page.getByRole('dialog').getByText('Reloj abierto').waitFor();
    });
    await paso('Cerrar con hora: ayer a las 9:00, "se olvidó de pausar"', async () => {
      await page.getByRole('button', { name: 'Cerrar con hora' }).click();
      await page.getByLabel('Hora real de fin').fill(`${ayer}T09:00`);
      await page.getByLabel('Motivo').fill('Se olvidó de pausar al irse');
      await page.getByRole('button', { name: 'Guardar' }).click();
      await page.getByText('Reloj cerrado con la hora real.').waitFor();
      await page.getByText(`Corregido por ${ger}: Se olvidó de pausar al irse`).waitFor();
    });
    await paso('Cargar horas a mano: 2 h de ayer a la tarde', async () => {
      await page.getByRole('button', { name: /Cargar horas a mano/ }).click();
      await page.getByLabel('Tarea').selectOption({ label: `${ot.codigo_ot} · zz_test cli13 ${s} · zz_test imprimir lona` });
      await page.getByLabel('Inicio').fill(`${ayer}T14:00`);
      await page.getByLabel('Fin').fill(`${ayer}T16:00`);
      await page.getByLabel('Motivo').fill('Trabajó sin celular');
      await page.getByRole('button', { name: 'Cargar', exact: true }).click();
      await page.getByText('Horas cargadas: ya suman al costo de la OT.').waitFor();
      await page.getByText(`A mano (${ger}): Trabajó sin celular`).waitFor();
      await page.getByText('Total del período: 3 h').waitFor();
    });
    await paso('la OT queda con 3 h de mano de obra y la tarea en pausa', async () => {
      const [{ seg }] = await sql`SELECT sum(segundos * peso / peso_total)::float8 AS seg FROM v_mano_obra WHERE orden_trabajo_id = ${ot.id}`;
      if (seg !== 10800) throw new Error('segundos = ' + seg);
      const [t] = await sql`SELECT estado FROM tarea WHERE orden_trabajo_id = ${ot.id}`;
      if (t.estado !== 'PAUSADA') throw new Error('tarea ' + t.estado);
    });
    if (errores.length) throw new Error(errores.join(' | '));
    console.log(`\n>>> RECORRIDO CORREGIR HORAS (CA-13.6) EN VERDE: ${n}/${n} PASOS OK <<<\n`);
  } finally {
    await browser.close();
    if (personaId) {
      await sql`UPDATE tarea_intervalo SET hora_fin = greatest(clock_timestamp(), hora_inicio), motivo_cierre = 'FIN' WHERE hora_fin IS NULL AND persona_id = ${personaId}`;
      await sql`UPDATE persona SET activo = false WHERE id = ${personaId}`;
    }
    await sql`UPDATE usuario SET activo = false WHERE username = ${ger}`;
    await sql.end({ timeout: 3 });
  }
})().catch(() => process.exit(1));
