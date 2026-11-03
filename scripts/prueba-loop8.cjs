/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console, process, crypto */
/**
 * Recorrido del Loop 8 en navegador: Edu pide un permiso por horas desde "Permisos" → Juan (jefe) lo autoriza
 * → Sofi (RR.HH.) lo registra sin descuento → Edu lo ve registrado con las tres firmas.
 * Además Sofi ve la asistencia y filtra las marcaciones fuera de la sede.
 *
 * Uso: node scripts/prueba-loop8.cjs   (BASE_URL y CHROMIUM_PATH opcionales)
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
  const clave = 'Password123!';
  const hash = await hashearPassword(clave);
  const opciones = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : process.platform === 'win32' ? { channel: 'chrome' } : {};
  const browser = await chromium.launch(opciones);
  const page = await browser.newPage();
  page.setDefaultTimeout(12000);
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  const usuarios = [];
  let n = 0;
  const paso = async (t, fn) => {
    n += 1;
    try {
      await fn();
      console.log('OK  ', n, t);
    } catch (e) {
      console.log('FALLA', n, t, '->', e.message.split('\n')[0]);
      await page.screenshot({ path: `prueba-loop8-falla-${n}.png` });
      throw e;
    }
  };
  const usuario = async (nombre, cap, persona = null) => {
    const [u] = await sql`INSERT INTO usuario (username, password_hash, persona_id) VALUES (${nombre}, ${hash}, ${persona}) RETURNING id`;
    await sql`INSERT INTO permiso_capacidad (usuario_id, capacidad) VALUES (${u.id}, ${cap})`;
    usuarios.push(u.id);
    return u.id;
  };
  const entrar = async (nombre) => {
    await page.context().clearCookies();
    await page.goto(B + '/login');
    await page.getByPlaceholder('Nombre de usuario').fill(nombre);
    await page.locator('input[type=password]').fill(clave);
    await page.getByRole('button', { name: /Iniciar sesión/ }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  };

  const personas = [];
  try {
    let numero;
    await paso('fixtures: Edu (taller, persona), Juan (admin), Sofi (rrhh) y una marcación de Edu fuera de la sede', async () => {
      const [p] = await sql`INSERT INTO persona (nombre, ci) VALUES (${'zz_test_Edu8 ' + s}, ${'C8E' + s}) RETURNING id`;
      personas.push(p.id);
      await usuario(`zz_test_edu8_${s}`, 'taller', p.id);
      await usuario(`zz_test_juan8_${s}`, 'admin');
      await usuario(`zz_test_sofi8_${s}`, 'rrhh');
      await sql`INSERT INTO marcacion_asistencia (persona_id, tipo, gps_lat, gps_lng, distancia_m, dentro_geocerca, dispositivo_hash, clave_idempotencia)
        VALUES (${p.id}, 'ENTRADA', -25.30, -57.60, 2500, false, ${'a'.repeat(64)}, ${crypto.randomUUID()})`;
    });

    await paso('Edu pide permiso para retirarse antes (15:00 a 17:00) desde el menú Permisos', async () => {
      await entrar(`zz_test_edu8_${s}`);
      await page.getByRole('link', { name: 'Permisos' }).click();
      await page.waitForURL(/\/permisos/);
      await page.getByRole('button', { name: /Pedir permiso/ }).click();
      await page.locator('#permisoTipo').selectOption('RETIRO_ANTICIPADO');
      await page.locator('#permisoMotivo').fill('Turno médico de mi hijo ' + s);
      await page.locator('#permisoHoraDesde').fill('15:00');
      await page.locator('#permisoHoraHasta').fill('17:00');
      await page.getByRole('button', { name: /Enviar solicitud/ }).click();
      await page.waitForURL(/\/permisos\/[0-9a-f-]{36}/);
      numero = (await page.locator('h1').textContent()).trim();
      if (!/^PER-\d{4}-\d{4,}$/.test(numero)) throw new Error('Número inesperado: ' + numero);
      await page.getByText('Pendiente').first().waitFor();
      if (await page.getByRole('button', { name: 'Autorizar' }).count()) throw new Error('Edu puede autorizarse');
    });

    const abrir = async (usr) => {
      await entrar(usr);
      await page.goto(B + '/permisos');
      await page.getByPlaceholder(/Buscar por número/).fill(numero);
      await page.getByText(numero).first().click();
      await page.waitForURL(/\/permisos\/[0-9a-f-]{36}/);
    };

    await paso('Juan (jefe) lo autoriza', async () => {
      await abrir(`zz_test_juan8_${s}`);
      await page.getByRole('button', { name: 'Autorizar' }).click();
      await page.getByText(/Autorizó \(jefe inmediato\)/).waitFor();
    });

    await paso('Sofi (RR.HH.) lo registra sin descuento', async () => {
      await abrir(`zz_test_sofi8_${s}`);
      await page.getByRole('button', { name: 'Registrar sin descuento' }).click();
      await page.getByText(/Registró \(RR\.HH\.\)/).waitFor();
    });

    await paso('Edu lo ve registrado, sin descuento, con las tres firmas', async () => {
      await abrir(`zz_test_edu8_${s}`);
      await page.getByText('Sin descuento').first().waitFor();
      for (const f of [/^Solicitó$/, /Autorizó \(jefe inmediato\)/, /Registró \(RR\.HH\.\)/]) await page.getByText(f).first().waitFor();
    });

    await paso('Sofi ve la asistencia y filtra "fuera de la sede"', async () => {
      await entrar(`zz_test_sofi8_${s}`);
      await page.getByRole('link', { name: 'Asistencia' }).click();
      await page.waitForURL(/\/asistencia/);
      await page.getByPlaceholder(/Buscar por persona/).fill('zz_test_Edu8 ' + s);
      await page.getByText('zz_test_Edu8 ' + s).first().waitFor();
      await page.getByRole('group', { name: 'Filtro de estado' }).getByRole('button', { name: 'Fuera de la sede' }).click();
      await page.waitForURL(/estado=FUERA/);
      await page.getByText(/2,5 km/).first().waitFor();
      await page.getByText('Fuera', { exact: true }).first().waitFor();
    });

    if (errores.length) throw new Error(errores.join(' | '));
    console.log(`\n>>> RECORRIDO LOOP 8 EN VERDE: ${n}/${n} PASOS OK <<<\n`);
  } finally {
    await browser.close();
    if (usuarios.length) await sql`UPDATE usuario SET activo = false WHERE id = ANY(${usuarios}::uuid[])`;
    if (personas.length) await sql`UPDATE persona SET activo = false WHERE id = ANY(${personas}::uuid[])`;
    await sql.end({ timeout: 3 });
  }
})().catch(() => process.exit(1));
