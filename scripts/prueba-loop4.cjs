/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console, process */
/**
 * Recorrido del Loop 4 en navegador: coordinación arma la hoja (vehículo, cuadrilla, parada) →
 * el montador marca entrada (GPS simulado), inicia el viaje, completa la parada y cierra el viaje.
 * Uso: node scripts/prueba-loop4.cjs   (BASE_URL y CHROMIUM_PATH opcionales)
 */
const { chromium } = require('playwright');
const postgres = require('postgres');
const { FOTO_JPEG } = require('./foto-prueba.cjs');
const { config } = require('dotenv');

config({ path: ['.env', '.env.test'] });
const B = process.env.BASE_URL || 'http://localhost:5173';

(async () => {
  const sql = postgres(process.env.DATABASE_URL_ADMIN, { max: 1, prepare: false });
  const { hashearPassword } = await import('../apps/api/dist/modules/auth/password.js');
  const s = Math.random().toString(36).slice(2, 8);
  const hash = await hashearPassword('Password123!');
  const opciones = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : process.platform === 'win32' ? { channel: 'chrome' } : {};
  const browser = await chromium.launch(opciones);
  // GPS simulado en la fábrica (dentro de la geocerca).
  const ctx = await browser.newContext({ geolocation: { latitude: -25.3206, longitude: -57.6242 }, permissions: ['geolocation'] });
  const page = await ctx.newPage();
  page.setDefaultTimeout(12000);
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  const usuarios = [];
  let personaId = null;
  let n = 0;
  const paso = async (t, fn) => {
    n += 1;
    try { await fn(); console.log('OK  ', n, t); } catch (e) {
      console.log('FALLA', n, t, '->', e.message.split('\n')[0]);
      await page.screenshot({ path: `prueba-loop4-falla-${n}.png` });
      throw e;
    }
  };
  const entrar = async (u) => {
    await ctx.clearCookies();
    await page.goto(B + '/login');
    await page.getByPlaceholder('Nombre de usuario').fill(u);
    await page.locator('input[type=password]').fill('Password123!');
    await page.getByRole('button', { name: /Iniciar sesión/ }).click();
    await page.waitForURL((x) => !x.pathname.startsWith('/login'));
  };
  try {
    await paso('fixtures: coordinadora, montador con persona, vehículo, sede, OT en Luque', async () => {
      for (const [u, cap] of [[`zz_test_coord_${s}`, 'comercial'], [`zz_test_mont_${s}`, 'montaje']]) {
        const [r] = await sql`INSERT INTO usuario (username, password_hash) VALUES (${u}, ${hash}) RETURNING id`;
        await sql`INSERT INTO permiso_capacidad (usuario_id, capacidad) VALUES (${r.id}, ${cap})`;
        usuarios.push(r.id);
      }
      const [p] = await sql`INSERT INTO persona (nombre, ci) VALUES (${'zz_test_Montador ' + s}, ${'CIM' + s}) RETURNING id`;
      personaId = p.id;
      await sql`UPDATE usuario SET persona_id = ${p.id} WHERE id = ${usuarios[1]}`;
      await sql`INSERT INTO vehiculo (chapa, marca_modelo) VALUES (${'ZZ4' + s.toUpperCase()}, 'Hilux zz_test')`;
      await sql`INSERT INTO sede (nombre, gps_lat, gps_lng) SELECT 'zz_test Fábrica', -25.320588, -57.624181 WHERE NOT EXISTS (SELECT 1 FROM sede WHERE activo)`;
      const [c] = await sql`INSERT INTO cliente (codigo, nombre) VALUES (${'Z4' + s}, ${'zz_test_cli4_' + s}) RETURNING id`;
      const [su] = await sql`INSERT INTO sucursal (cliente_id, nombre, gps_lat, gps_lng) VALUES (${c.id}, 'Luque', -25.2697, -57.4873) RETURNING id`;
      const [ot] = await sql`INSERT INTO orden_trabajo (codigo_ot, cliente_id, sucursal_id, titulo, creado_por) VALUES (${'OT-Z4-' + s}, ${c.id}, ${su.id}, 'zz_test Letrero', ${usuarios[0]}) RETURNING id`;
      await sql`INSERT INTO ot_evento (orden_trabajo_id, estado_nuevo, autor_id) VALUES (${ot.id}, 'PENDIENTE', ${usuarios[0]})`;
    });
    await paso('coordinación crea la hoja de hoy con el vehículo', async () => {
      await entrar(`zz_test_coord_${s}`);
      await page.getByRole('link', { name: /Salidas/ }).click();
      await page.locator('#hDesc').fill('zz_test Montajes ' + s);
      await page.locator('#hVehiculo').selectOption({ label: 'ZZ4' + s.toUpperCase() });
      await page.getByRole('button', { name: /Nueva hoja/ }).click();
      await page.waitForURL(/\/hojas-ruta\/[0-9a-f-]{36}$/);
    });
    await paso('agrega al montador como conductor y la parada de la OT', async () => {
      await page.getByLabel('Persona').selectOption({ label: 'zz_test_Montador ' + s });
      await page.getByLabel('Rol').selectOption('CONDUCTOR');
      await page.getByRole('button', { name: /^Agregar$/ }).click();
      await page.getByText('zz_test_Montador ' + s).first().waitFor();
      await page.getByPlaceholder(/Buscar OT/).fill('OT-Z4-' + s);
      await page.getByRole('button', { name: new RegExp('OT-Z4-' + s) }).click();
      await page.getByText(/Paradas \(1\)/).waitFor();
    });
    await paso('el montador marca entrada dentro de la zona', async () => {
      await entrar(`zz_test_mont_${s}`);
      await page.goto(B + '/calle');
      await page.getByRole('button', { name: /Marcar entrada/ }).click();
      await page.getByText(/Entrada registrada\./).waitFor();
    });
    await paso('inicia el viaje con 1000 km', async () => {
      await page.locator('#kmOdometro').fill('1000');
      await page.getByLabel('Foto del odómetro').setInputFiles(FOTO_JPEG); // obligatoria desde L4.E3
      await page.getByTestId('foto-odometro-lista').waitFor();
      await page.getByRole('button', { name: /Iniciar viaje/ }).click();
      await page.getByText(/Viaje en curso/).waitFor();
    });
    await paso('completa la parada → la hoja queda terminada', async () => {
      await page.getByRole('button', { name: /Hecha/ }).click();
      await page.getByText(/Salida terminada/).waitFor();
    });
    await paso('cierra el viaje con 1030 km', async () => {
      await page.locator('#kmOdometro').fill('1030');
      await page.getByLabel('Foto del odómetro').setInputFiles(FOTO_JPEG);
      await page.getByTestId('foto-odometro-lista').waitFor();
      await page.getByRole('button', { name: /Cerrar viaje/ }).click();
      await page.getByText(/Viaje cerrado: 30 km/).waitFor();
    });
    if (errores.length) throw new Error(errores.join(' | '));
    console.log(`\n>>> RECORRIDO LOOP 4 EN VERDE: ${n}/${n} PASOS OK <<<\n`);
  } finally {
    await browser.close();
    if (personaId) await sql`UPDATE viaje SET km_fin = km_inicio, hora_fin = greatest(clock_timestamp(), hora_inicio) WHERE km_fin IS NULL AND conductor_persona_id = ${personaId}`;
    if (personaId) await sql`UPDATE persona SET activo = false WHERE id = ${personaId}`;
    if (usuarios.length) await sql`UPDATE usuario SET activo = false WHERE id = ANY(${usuarios}::uuid[])`;
    await sql.end({ timeout: 3 });
  }
})().catch(() => process.exit(1));
