/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console, process, URL */
/**
 * Recorrido de fotos y archivos (Loop 4, L4.E3), de punta a punta en el navegador:
 * odómetro obligatorio y foto del montaje en "En la calle" → Comercial los ve en la hoja de ruta;
 * muestra de impresión en la OT; comprobante PDF en un permiso; foto del pedido desde el portal → Comercial la ve.
 * Comprueba que las imágenes CARGAN (bucket privado con enlace temporal), no solo que exista la fila.
 * Uso: node scripts/prueba-fotos.cjs   (BASE_URL y CHROMIUM_PATH opcionales)
 * En local, la API tiene que correr con ALMACENAMIENTO=memoria; contra Vercel, con SUPABASE_SECRET_KEY cargada.
 */
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const postgres = require('postgres');
const { config } = require('dotenv');
const { FOTO_JPEG, PDF } = require('./foto-prueba.cjs');

config({ path: ['.env', '.env.test'] });
const B = process.env.BASE_URL || 'http://localhost:5173';

(async () => {
  const sql = postgres(process.env.DATABASE_URL_ADMIN, { max: 1, prepare: false });
  const { hashearPassword } = await import('../apps/api/dist/modules/auth/password.js');
  const s = Math.random().toString(36).slice(2, 8);
  const hash = await hashearPassword('Password123!');
  const opciones = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : process.platform === 'win32' ? { channel: 'chrome' } : {};
  const browser = await chromium.launch(opciones);
  const ctx = await browser.newContext({ geolocation: { latitude: -25.3206, longitude: -57.6242 }, permissions: ['geolocation'] });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  const usuarios = [];
  const personas = [];
  const f = {};
  let n = 0;
  const paso = async (t, fn) => {
    n += 1;
    try { await fn(); console.log('OK  ', n, t); } catch (e) {
      console.log('FALLA', n, t, '->', e.message.split('\n')[0]);
      await page.screenshot({ path: `prueba-fotos-falla-${n}.png` });
      throw e;
    }
  };
  const usuario = async (nombre, caps, conPersona) => {
    const [u] = await sql`INSERT INTO usuario (username, password_hash) VALUES (${nombre}, ${hash}) RETURNING id`;
    for (const c of caps) await sql`INSERT INTO permiso_capacidad (usuario_id, capacidad) VALUES (${u.id}, ${c})`;
    usuarios.push(u.id);
    if (!conPersona) return { id: u.id };
    const [p] = await sql`INSERT INTO persona (nombre, ci) VALUES (${'zz_test_' + nombre}, ${'CF' + nombre}) RETURNING id`;
    personas.push(p.id);
    await sql`UPDATE usuario SET persona_id = ${p.id} WHERE id = ${u.id}`;
    return { id: u.id, persona: p.id };
  };
  const entrar = async (u) => {
    await ctx.clearCookies();
    await page.goto(B + '/login');
    await page.getByPlaceholder('Nombre de usuario').fill(u);
    await page.locator('input[type=password]').fill('Password123!');
    await page.getByRole('button', { name: /Iniciar sesión/ }).click();
    await page.waitForURL((x) => !x.pathname.startsWith('/login'));
  };
  /** Espera a que haya `cuantas` imágenes CARGADAS (no rotas) dentro del contenedor. */
  const imagenesCargadas = async (contenedor, cuantas) => {
    for (let i = 0; i < 40; i++) {
      const ok = await contenedor.locator('img').evaluateAll((ims) => ims.filter((im) => im.complete && im.naturalWidth > 0).length);
      if (ok >= cuantas) return;
      await page.waitForTimeout(250);
    }
    throw new Error(`No cargaron ${cuantas} imágenes`);
  };
  const subidos = async (where) => (await sql`SELECT count(*)::int AS n FROM archivo WHERE estado = 'SUBIDO' AND ${where}`)[0].n;
  const esperarSubidos = async (where, cuantos) => {
    for (let i = 0; i < 40; i++) {
      if ((await subidos(where)) >= cuantos) return;
      await page.waitForTimeout(250);
    }
    throw new Error(`No se subieron ${cuantos} archivos`);
  };

  try {
    await paso('fixtures: comercial, montador conductor de la hoja de hoy, taller con una tarea, cliente con enlace del portal', async () => {
      f.sofi = await usuario(`zz_test_sofiF_${s}`, ['comercial'], false);
      f.mont = await usuario(`zz_test_montF_${s}`, ['montaje'], true);
      f.edu = await usuario(`zz_test_eduF_${s}`, ['taller'], true);
      const [v] = await sql`INSERT INTO vehiculo (chapa, marca_modelo) VALUES (${'ZFT' + s.toUpperCase()}, 'Hilux zz_test') RETURNING id`;
      await sql`INSERT INTO sede (nombre, gps_lat, gps_lng) SELECT 'zz_test Fábrica', -25.320588, -57.624181 WHERE NOT EXISTS (SELECT 1 FROM sede WHERE activo)`;
      const [c] = await sql`INSERT INTO cliente (codigo, nombre) VALUES (${'ZF' + s}, ${'zz_test_cliFotos_' + s}) RETURNING id`;
      f.cliente = c.id;
      const [su] = await sql`INSERT INTO sucursal (cliente_id, nombre, gps_lat, gps_lng) VALUES (${c.id}, 'Luque', -25.2697, -57.4873) RETURNING id`;
      const [ot] = await sql`INSERT INTO orden_trabajo (codigo_ot, cliente_id, sucursal_id, titulo, creado_por) VALUES (${'OT-ZF-' + s}, ${c.id}, ${su.id}, 'zz_test Letrero', ${f.sofi.id}) RETURNING id`;
      f.ot = ot.id;
      await sql`INSERT INTO ot_evento (orden_trabajo_id, estado_nuevo, autor_id) VALUES (${ot.id}, 'PENDIENTE', ${f.sofi.id})`;
      await sql`INSERT INTO tarea (orden_trabajo_id, persona_asignada_id, tipo, descripcion, creado_por) VALUES (${ot.id}, ${f.edu.persona}, 'TALLER_IMPRESION', ${'Lona zz ' + s}, ${f.sofi.id})`;
      const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(new Date());
      const [h] = await sql`INSERT INTO hoja_ruta (fecha, vehiculo_id, creado_por) VALUES (${hoy}, ${v.id}, ${f.sofi.id}) RETURNING id`;
      f.hoja = h.id;
      await sql`INSERT INTO hoja_ruta_persona (hoja_ruta_id, persona_id, rol) VALUES (${h.id}, ${f.mont.persona}, 'CONDUCTOR')`;
      await sql`INSERT INTO hoja_ruta_parada (hoja_ruta_id, orden_trabajo_id, orden_secuencia) VALUES (${h.id}, ${ot.id}, 1)`;
      f.token = crypto.randomBytes(32).toString('base64url');
      const [a] = await sql`INSERT INTO portal_acceso (cliente_id, descripcion, token_hash, expira_at, creado_por)
        VALUES (${c.id}, 'zz_test Compras', ${crypto.createHash('sha256').update(f.token).digest('hex')}, now() + interval '1 day', ${f.sofi.id}) RETURNING id`;
      f.acceso = a.id;
    });

    await paso('montador: sin foto no inicia; con foto inicia el viaje y la foto sube', async () => {
      await entrar(`zz_test_montF_${s}`);
      await page.goto(B + '/calle');
      await page.locator('#kmOdometro').fill('5000');
      await page.getByRole('button', { name: /Iniciar viaje/ }).click();
      await page.getByText('Sacale una foto al odómetro').waitFor();
      await page.getByLabel('Foto del odómetro').setInputFiles(FOTO_JPEG);
      await page.getByTestId('foto-odometro-lista').waitFor();
      await page.getByRole('button', { name: /Iniciar viaje/ }).click();
      await page.getByText(/Viaje en curso/).waitFor();
      await esperarSubidos(sql`tipo = 'ODOMETRO_INICIO' AND viaje_id IN (SELECT id FROM viaje WHERE hoja_ruta_id = ${f.hoja})`, 1);
    });

    await paso('montador: dos fotos del montaje en la parada; cierra el viaje con su foto', async () => {
      for (let i = 0; i < 2; i++) await page.getByLabel('Foto del montaje').setInputFiles(FOTO_JPEG);
      await page.getByRole('button', { name: /Hecha/ }).click();
      await page.locator('#kmOdometro').fill('5012');
      await page.getByLabel('Foto del odómetro').setInputFiles(FOTO_JPEG);
      await page.getByTestId('foto-odometro-lista').waitFor();
      await page.getByRole('button', { name: /Cerrar viaje/ }).click();
      await page.getByText(/Viaje cerrado: 12 km/).waitFor();
      await esperarSubidos(sql`viaje_id IN (SELECT id FROM viaje WHERE hoja_ruta_id = ${f.hoja})`, 2);
      await esperarSubidos(sql`parada_id IN (SELECT id FROM hoja_ruta_parada WHERE hoja_ruta_id = ${f.hoja})`, 2);
    });

    await paso('Comercial ve en la hoja de ruta los km con las 2 fotos del odómetro y las 2 del montaje (cargan)', async () => {
      await entrar(`zz_test_sofiF_${s}`);
      await page.goto(B + `/hojas-ruta/${f.hoja}`);
      const sec = page.getByTestId('fotos-hoja');
      await sec.getByText(/5000 km → 5012 km/).waitFor();
      await imagenesCargadas(sec, 4);
      if (await sec.getByText(/Falta la foto del odómetro/).count()) throw new Error('Dice que falta la foto');
    });

    await paso('Comercial sube la foto de la muestra de impresión en la OT y se ve', async () => {
      await page.goto(B + `/ots/${f.ot}`);
      await page.getByRole('button', { name: `Muestras de Lona zz ${s}` }).click();
      const sec = page.getByTestId('archivos-muestra_tarea');
      await sec.getByText('Todavía no hay fotos de la muestra.').waitFor();
      await sec.getByLabel('Foto de la muestra').setInputFiles(FOTO_JPEG);
      await imagenesCargadas(sec, 1);
    });

    await paso('Edu (taller) adjunta un PDF como comprobante de su permiso', async () => {
      await entrar(`zz_test_eduF_${s}`);
      const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(new Date());
      const r = await page.request.post(B + '/api/permisos', {
        headers: { origin: new URL(B).origin },
        data: { tipo: 'SALUD', detalleTipo: 'Gripe', motivo: 'Reposo médico zz', modalidad: 'DIAS', fechaDesde: hoy, fechaHasta: hoy, claveIdempotencia: crypto.randomUUID() },
      });
      if (r.status() !== 201) throw new Error('No se creó el permiso: ' + r.status());
      const { id } = await r.json();
      await page.goto(B + `/permisos/${id}`);
      const sec = page.getByTestId('archivos-comprobante_permiso');
      await sec.getByText('Sin comprobantes adjuntos.').waitFor();
      await sec.getByLabel('Adjuntar foto o PDF').setInputFiles(PDF);
      await sec.getByText('PDF').waitFor();
      await esperarSubidos(sql`solicitud_permiso_id = ${id} AND mime = 'application/pdf'`, 1);
    });

    await paso('El cliente pide un trabajo con una foto desde el portal y la ve en "Mis pedidos"', async () => {
      const cliente = await browser.newPage();
      cliente.on('pageerror', (e) => errores.push(e.message));
      cliente.setDefaultTimeout(15000);
      await cliente.goto(`${B}/portal#t=${f.token}`);
      await cliente.locator('#pedidoDescripcion').fill('Cartel nuevo zz ' + s);
      await cliente.getByLabel('Agregar foto').first().setInputFiles(FOTO_JPEG);
      await cliente.getByTestId('fotos-pedido').locator('img').waitFor();
      await cliente.getByRole('button', { name: 'Enviar pedido' }).click();
      await cliente.getByText(/Recibimos tu pedido PED-/).waitFor();
      const item = cliente.getByTestId('portal-pedidos').locator('li', { hasText: 'Cartel nuevo zz ' + s });
      await item.locator('img').waitFor();
      f.numero = (await item.locator('span.font-mono').textContent()).split(' ')[0];
      await cliente.close();
    });

    await paso('Comercial abre el pedido y ve la foto del cliente', async () => {
      await entrar(`zz_test_sofiF_${s}`);
      await page.goto(B + '/pedidos');
      await page.getByPlaceholder(/Buscar por número/).fill(f.numero);
      await page.getByText(f.numero).first().click();
      await imagenesCargadas(page.getByRole('dialog'), 1);
    });

    if (errores.length) throw new Error(errores.join(' | '));
    console.log(`\n>>> RECORRIDO FOTOS EN VERDE: ${n}/${n} PASOS OK <<<\n`);
  } finally {
    await browser.close();
    if (personas.length) await sql`UPDATE viaje SET km_fin = km_inicio, hora_fin = greatest(clock_timestamp(), hora_inicio) WHERE km_fin IS NULL AND conductor_persona_id = ANY(${personas}::uuid[])`;
    if (personas.length) await sql`UPDATE persona SET activo = false WHERE id = ANY(${personas}::uuid[])`;
    if (f.acceso) await sql`UPDATE portal_acceso SET activo = false WHERE id = ${f.acceso}`;
    if (usuarios.length) await sql`UPDATE usuario SET activo = false WHERE id = ANY(${usuarios}::uuid[])`;
    await sql.end({ timeout: 3 });
  }
})().catch(() => process.exit(1));
