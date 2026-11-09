/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console, process */
/**
 * Recorrido sin señal (Loop 4, L4.E4): el montador abre "En la calle", se queda sin señal, marca entrada,
 * inicia el viaje y completa la parada; todo queda guardado en el celular. Vuelve la señal → se envía solo,
 * en orden, con la hora real y marcado "sin señal" en la base.
 * Uso: node scripts/prueba-sin-senal.cjs   (BASE_URL y CHROMIUM_PATH opcionales)
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
      await page.screenshot({ path: `prueba-sin-senal-falla-${n}.png` });
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
    await paso('fixtures: montador con persona, vehículo, hoja de hoy con él como conductor y una parada', async () => {
      const [r] = await sql`INSERT INTO usuario (username, password_hash) VALUES (${`zz_test_mont_off_${s}`}, ${hash}) RETURNING id`;
      await sql`INSERT INTO permiso_capacidad (usuario_id, capacidad) VALUES (${r.id}, 'montaje')`;
      usuarios.push(r.id);
      const [p] = await sql`INSERT INTO persona (nombre, ci) VALUES (${'zz_test_MontadorOff ' + s}, ${'CIO' + s}) RETURNING id`;
      personaId = p.id;
      await sql`UPDATE usuario SET persona_id = ${p.id} WHERE id = ${r.id}`;
      const [v] = await sql`INSERT INTO vehiculo (chapa, marca_modelo) VALUES (${'ZOF' + s.toUpperCase()}, 'Hilux zz_test') RETURNING id`;
      await sql`INSERT INTO sede (nombre, gps_lat, gps_lng) SELECT 'zz_test Fábrica', -25.320588, -57.624181 WHERE NOT EXISTS (SELECT 1 FROM sede WHERE activo)`;
      const [c] = await sql`INSERT INTO cliente (codigo, nombre) VALUES (${'ZO' + s}, ${'zz_test_cliOff_' + s}) RETURNING id`;
      const [su] = await sql`INSERT INTO sucursal (cliente_id, nombre, gps_lat, gps_lng) VALUES (${c.id}, 'Luque', -25.2697, -57.4873) RETURNING id`;
      const [ot] = await sql`INSERT INTO orden_trabajo (codigo_ot, cliente_id, sucursal_id, titulo, creado_por) VALUES (${'OT-ZO-' + s}, ${c.id}, ${su.id}, 'zz_test Letrero', ${r.id}) RETURNING id`;
      await sql`INSERT INTO ot_evento (orden_trabajo_id, estado_nuevo, autor_id) VALUES (${ot.id}, 'PENDIENTE', ${r.id})`;
      const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(new Date());
      const [h] = await sql`INSERT INTO hoja_ruta (fecha, vehiculo_id, creado_por) VALUES (${hoy}, ${v.id}, ${r.id}) RETURNING id`;
      await sql`INSERT INTO hoja_ruta_persona (hoja_ruta_id, persona_id, rol) VALUES (${h.id}, ${p.id}, 'CONDUCTOR')`;
      await sql`INSERT INTO hoja_ruta_parada (hoja_ruta_id, orden_trabajo_id, orden_secuencia) VALUES (${h.id}, ${ot.id}, 1)`;
    });

    await paso('abre "En la calle" con señal', async () => {
      await entrar(`zz_test_mont_off_${s}`);
      await page.goto(B + '/calle');
      await page.getByText('OT-ZO-' + s).first().waitFor();
    });

    await paso('sin señal: marca entrada, inicia el viaje y completa la parada; todo queda guardado', async () => {
      await ctx.setOffline(true);
      await page.getByRole('button', { name: /Marcar entrada/ }).click();
      await page.getByText(/Entrada guardada sin señal/).waitFor();
      await page.locator('#kmOdometro').fill('2000');
      await page.getByLabel('Foto del odómetro').setInputFiles(FOTO_JPEG); // L4.E3: queda en el celular
      await page.getByTestId('foto-odometro-lista').waitFor();
      await page.getByRole('button', { name: /Iniciar viaje/ }).click();
      await page.getByText(/inicio del viaje está guardado sin señal/).waitFor();
      await page.getByRole('button', { name: /Hecha/ }).click();
      await page.getByText(/se envía cuando vuelva la señal/).waitFor();
      await page.getByTestId('estado-conexion').getByText(/3 acciones guardadas/).waitFor();
      // La próxima marcación ya es "salida" (la entrada está guardada).
      await page.getByRole('button', { name: /Marcar salida/ }).waitFor();
      const [{ n: enBase }] = await sql`SELECT count(*)::int AS n FROM marcacion_asistencia WHERE persona_id = ${personaId}`;
      if (enBase !== 0) throw new Error('Llegó algo sin señal');
    });

    await paso('vuelve la señal: se envía solo, en orden, con la hora real y marcado "sin señal"', async () => {
      await page.waitForTimeout(1500);
      await ctx.setOffline(false);
      await page.getByText(/Se enviaron 3 acciones guardadas sin señal/).waitFor({ timeout: 20000 });
      const [m] = await sql`SELECT sin_senal, extract(epoch FROM recibida_at - marcada_at) AS atraso FROM marcacion_asistencia WHERE persona_id = ${personaId}`;
      const [v] = await sql`SELECT inicio_sin_senal, km_inicio::float8 AS km FROM viaje WHERE conductor_persona_id = ${personaId}`;
      const [pa] = await sql`SELECT estado, cierre_sin_senal FROM hoja_ruta_parada pa JOIN hoja_ruta_persona q ON q.hoja_ruta_id = pa.hoja_ruta_id WHERE q.persona_id = ${personaId}`;
      if (!m?.sin_senal || Number(m.atraso) < 1) throw new Error('Marcación sin la hora real: ' + JSON.stringify(m));
      if (!v?.inicio_sin_senal || v.km !== 2000) throw new Error('Viaje inesperado: ' + JSON.stringify(v));
      if (pa?.estado !== 'COMPLETADA' || !pa.cierre_sin_senal) throw new Error('Parada inesperada: ' + JSON.stringify(pa));
      await page.getByText(/Viaje en curso/).waitFor();
    });

    await paso('la foto del odómetro, guardada sin señal, sube sola después del inicio del viaje (L4.E3)', async () => {
      for (let i = 0; i < 40; i++) {
        const [f] = await sql`SELECT a.estado FROM archivo a JOIN viaje v ON v.id = a.viaje_id WHERE v.conductor_persona_id = ${personaId} AND a.tipo = 'ODOMETRO_INICIO'`;
        if (f?.estado === 'SUBIDO') return;
        await page.waitForTimeout(500);
      }
      throw new Error('La foto del odómetro no subió');
    });

    if (errores.length) throw new Error(errores.join(' | '));
    console.log(`\n>>> RECORRIDO SIN SEÑAL EN VERDE: ${n}/${n} PASOS OK <<<\n`);
  } finally {
    await browser.close();
    if (personaId) await sql`UPDATE viaje SET km_fin = km_inicio, hora_fin = greatest(clock_timestamp(), hora_inicio) WHERE km_fin IS NULL AND conductor_persona_id = ${personaId}`;
    if (personaId) await sql`UPDATE persona SET activo = false WHERE id = ${personaId}`;
    if (usuarios.length) await sql`UPDATE usuario SET activo = false WHERE id = ANY(${usuarios}::uuid[])`;
    await sql.end({ timeout: 3 });
  }
})().catch(() => process.exit(1));
