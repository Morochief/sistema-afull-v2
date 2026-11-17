/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console, process */
/**
 * Recorrido CA-16.7 (Loop 16): Carlos (conductor) sale desde su casa con el camión y marca la entrada de la cuadrilla:
 * el celular le pide el motivo por estar fuera de zona; Gerardo ve a la cuadrilla "sin tarea en marcha" en el Panel y,
 * en Asistencia, "El conductor (Carlos)" con el motivo.
 * Uso: node scripts/prueba-cuadrilla.cjs   (BASE_URL y CHROMIUM_PATH opcionales)
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
  const usuarios = [`zz_test_ger16_${s}`, `zz_test_carlos16_${s}`];
  const nombres = { carlos: `zz_test_Carlos16 ${s}`, kevin: `zz_test_Kevin16 ${s}`, lucas: `zz_test_Lucas16 ${s}` };
  const opciones = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : process.platform === 'win32' ? { channel: 'chrome' } : {};
  const browser = await chromium.launch(opciones);
  const cg = await browser.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'America/Asuncion' });
  // Carlos está en Luque (su casa), lejos de la fábrica.
  const cc = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Asuncion',
    geolocation: { latitude: -25.2697, longitude: -57.4873 }, permissions: ['geolocation'] });
  const pg = await cg.newPage();
  const pc = await cc.newPage();
  for (const p of [pg, pc]) p.setDefaultTimeout(15000);
  const errores = [];
  for (const p of [pg, pc]) p.on('pageerror', (e) => errores.push(e.message));
  let n = 0;
  const personas = {};
  const paso = async (t, fn) => {
    n += 1;
    try { await fn(); console.log('OK  ', n, t); } catch (e) {
      console.log('FALLA', n, t, '->', e.message.split('\n')[0]);
      await pg.screenshot({ path: `prueba-cuadrilla-falla-${n}-gerardo.png` });
      await pc.screenshot({ path: `prueba-cuadrilla-falla-${n}-carlos.png` });
      throw e;
    }
  };
  const entrar = async (page, user, destino) => {
    await page.goto(B + '/login');
    await page.getByPlaceholder('Nombre de usuario').fill(user);
    await page.locator('input[type=password]').fill('Password123!');
    await page.getByRole('button', { name: /Iniciar sesión/ }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'));
    await page.goto(B + destino);
  };
  try {
    await paso('fixture: salida de hoy con Carlos de conductor y dos ayudantes sin celular; la fábrica como sede', async () => {
      const hash = await hashearPassword('Password123!');
      const [g] = await sql`INSERT INTO usuario (username, password_hash) VALUES (${usuarios[0]}, ${hash}) RETURNING id`;
      await sql`INSERT INTO permiso_capacidad (usuario_id, capacidad) VALUES (${g.id}, 'comercial'), (${g.id}, 'rrhh')`;
      for (const [k, nombre] of Object.entries(nombres)) {
        personas[k] = (await sql`INSERT INTO persona (nombre, ci) VALUES (${nombre}, ${'Q16' + k + s}) RETURNING id`)[0].id;
      }
      const [c] = await sql`INSERT INTO usuario (username, password_hash, persona_id) VALUES (${usuarios[1]}, ${hash}, ${personas.carlos}) RETURNING id`;
      await sql`INSERT INTO permiso_capacidad (usuario_id, capacidad) VALUES (${c.id}, 'montaje')`;
      await sql`INSERT INTO sede (nombre, gps_lat, gps_lng) SELECT 'zz_test Fábrica', -25.320588, -57.624181 WHERE NOT EXISTS (SELECT 1 FROM sede WHERE activo)`;
      const [v] = await sql`INSERT INTO vehiculo (chapa, marca_modelo) VALUES (${'Q16' + s.toUpperCase()}, 'zz_test camión') RETURNING id`;
      const [h] = await sql`INSERT INTO hoja_ruta (fecha, vehiculo_id, creado_por) VALUES ((now() AT TIME ZONE 'America/Asuncion')::date, ${v.id}, ${g.id}) RETURNING id`;
      await sql`INSERT INTO hoja_ruta_persona (hoja_ruta_id, persona_id, rol) VALUES (${h.id}, ${personas.carlos}, 'CONDUCTOR'),
                (${h.id}, ${personas.kevin}, 'AYUDANTE'), (${h.id}, ${personas.lucas}, 'AYUDANTE')`;
    });
    await paso('Carlos en "En la calle" ve su cuadrilla: los tres tildados para la entrada', async () => {
      await entrar(pc, usuarios[1], '/calle');
      await pc.getByText(/Cuadrilla · Q16/).waitFor();
      await pc.getByRole('button', { name: 'Marcar entrada de 3' }).waitFor();
    });
    await paso('marca: está fuera de zona → le pide el motivo → "Salí desde casa con el camión" → entrada de 3', async () => {
      await pc.getByRole('button', { name: 'Marcar entrada de 3' }).click();
      await pc.getByRole('heading', { name: 'Estás fuera de la zona' }).waitFor();
      await pc.getByRole('button', { name: 'Salí desde casa con el camión' }).click();
      await pc.getByRole('button', { name: 'Marcar igual' }).click();
      await pc.getByText('Entrada marcada para 3 de la cuadrilla.').waitFor();
      await pc.getByRole('button', { name: 'Marcar salida de 3' }).waitFor();
    });
    await paso('Gerardo los ve "sin tarea en marcha" en el Panel', async () => {
      await entrar(pg, usuarios[0], '/panel');
      for (const k of ['carlos', 'kevin', 'lucas']) await pg.getByTestId(`sintarea-${personas[k]}`).waitFor();
    });
    await paso('en Asistencia: "El conductor (Carlos)" y el motivo, en cada uno', async () => {
      await pg.goto(B + '/asistencia');
      await pg.getByPlaceholder(/Buscar/).fill(`zz_test_Kevin16 ${s}`);
      const fila = pg.locator('tr', { hasText: nombres.kevin });
      await fila.getByText(`El conductor (${nombres.carlos})`).waitFor();
      await fila.getByText('"Salí desde casa con el camión"').waitFor();
      const filas = await sql`SELECT origen, motivo_remoto FROM marcacion_asistencia WHERE persona_id IN (${personas.carlos}, ${personas.kevin}, ${personas.lucas})`;
      if (filas.length !== 3 || filas.some((f) => f.origen !== 'CUADRILLA' || f.motivo_remoto !== 'Salí desde casa con el camión')) throw new Error(JSON.stringify(filas));
    });
    if (errores.length) throw new Error(errores.join(' | '));
    console.log(`\n>>> RECORRIDO CUADRILLA (CA-16.7) EN VERDE: ${n}/${n} PASOS OK <<<\n`);
  } finally {
    await browser.close();
    for (const id of Object.values(personas)) await sql`UPDATE persona SET activo = false WHERE id = ${id}`;
    for (const u of usuarios) await sql`UPDATE usuario SET activo = false WHERE username = ${u}`;
    await sql.end({ timeout: 3 });
  }
})().catch(() => process.exit(1));
