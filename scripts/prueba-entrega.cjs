/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console, process, fetch, setTimeout */
/**
 * Recorrido CA-17.6 (Loop 17): Carlos, en el celular, marca la parada "Hecha": saca la foto de la remisión firmada y carga
 * quién recibió; Sofi lo ve en la OT (foto, nombre, cargo, hora); el cliente lo ve en su portal (sin la foto).
 * Uso: node scripts/prueba-entrega.cjs   (BASE_URL y CHROMIUM_PATH opcionales)
 */
const { chromium } = require('playwright');
const postgres = require('postgres');
const { config } = require('dotenv');
const { FOTO_JPEG } = require('./foto-prueba.cjs');

config({ path: ['.env', '.env.test'] });
const B = process.env.BASE_URL || 'http://localhost:5173';

(async () => {
  const sql = postgres(process.env.DATABASE_URL_ADMIN, { max: 1, prepare: false });
  const { hashearPassword } = await import('../apps/api/dist/modules/auth/password.js');
  const s = Math.random().toString(36).slice(2, 7);
  const usuarios = [`zz_test_sofi17_${s}`, `zz_test_carlos17_${s}`];
  const opciones = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : process.platform === 'win32' ? { channel: 'chrome' } : {};
  const browser = await chromium.launch(opciones);
  const cs = await browser.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'America/Asuncion' });
  const cc = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Asuncion' });
  const ps = await cs.newPage();
  const pc = await cc.newPage();
  const cliente = await cs.newPage();
  for (const p of [ps, pc, cliente]) p.setDefaultTimeout(15000);
  const errores = [];
  for (const p of [ps, pc, cliente]) p.on('pageerror', (e) => errores.push(e.message));
  let n = 0;
  let personaId;
  let otId;
  let token;
  const codigo = `OT-Z17-${s}`;
  const paso = async (t, fn) => {
    n += 1;
    try { await fn(); console.log('OK  ', n, t); } catch (e) {
      console.log('FALLA', n, t, '->', e.message.split('\n')[0]);
      await ps.screenshot({ path: `prueba-entrega-falla-${n}-sofi.png` });
      await pc.screenshot({ path: `prueba-entrega-falla-${n}-carlos.png` });
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
    await paso('fixture: OT con salida de hoy y Carlos de conductor; acceso al portal del cliente', async () => {
      const hash = await hashearPassword('Password123!');
      const [so] = await sql`INSERT INTO usuario (username, password_hash) VALUES (${usuarios[0]}, ${hash}) RETURNING id`;
      await sql`INSERT INTO permiso_capacidad (usuario_id, capacidad) VALUES (${so.id}, 'comercial')`;
      const [p] = await sql`INSERT INTO persona (nombre, ci) VALUES (${'zz_test_Carlos17 ' + s}, ${'E17' + s}) RETURNING id`;
      personaId = p.id;
      const [ca] = await sql`INSERT INTO usuario (username, password_hash, persona_id) VALUES (${usuarios[1]}, ${hash}, ${p.id}) RETURNING id`;
      await sql`INSERT INTO permiso_capacidad (usuario_id, capacidad) VALUES (${ca.id}, 'montaje')`;
      const [c] = await sql`INSERT INTO cliente (codigo, nombre) VALUES (${'C17-' + s}, ${'zz_test Farmacia17 ' + s}) RETURNING id`;
      const [o] = await sql`INSERT INTO orden_trabajo (codigo_ot, cliente_id, titulo, creado_por, estado) VALUES (${codigo}, ${c.id}, ${'zz_test letrero ' + s}, ${so.id}, 'EN_MONTAJE') RETURNING id`;
      otId = o.id;
      const [h] = await sql`INSERT INTO hoja_ruta (fecha, creado_por) VALUES ((now() AT TIME ZONE 'America/Asuncion')::date, ${so.id}) RETURNING id`;
      await sql`INSERT INTO hoja_ruta_persona (hoja_ruta_id, persona_id, rol) VALUES (${h.id}, ${p.id}, 'CONDUCTOR')`;
      await sql`INSERT INTO hoja_ruta_parada (hoja_ruta_id, orden_trabajo_id, orden_secuencia) VALUES (${h.id}, ${o.id}, 1)`;
      await entrar(ps, usuarios[0], `/ots/${otId}`);
      token = await ps.evaluate(async (clienteId) => (await (await fetch('/api/portal-accesos', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clienteId, descripcion: 'zz_test compras' }) })).json()).token, c.id);
      if (!token) throw new Error('sin token del portal');
      await ps.getByTestId('seccion-entrega').getByText('Todavía no se entregó.').waitFor();
    });
    await paso('Carlos toca "Hecha": sin nombre ni foto no deja; con la foto de la remisión y "María (encargada)" queda entregada', async () => {
      await entrar(pc, usuarios[1], '/calle');
      await pc.getByRole('button', { name: /Hecha/ }).click();
      await pc.getByRole('button', { name: 'Confirmar entrega' }).click();
      await pc.getByText('Escribí el nombre de quien recibió').waitFor();
      await pc.getByLabel(/Recibió/).fill(`zz_test María ${s}`);
      await pc.getByLabel('Cargo').fill('encargada');
      await pc.getByLabel('Foto de la remisión firmada').setInputFiles(FOTO_JPEG);
      await pc.getByText('Foto lista').waitFor();
      await pc.getByRole('button', { name: 'Confirmar entrega' }).click();
      await pc.getByText(`Entregado. Recibió zz_test María ${s}.`).waitFor();
      await pc.getByText(`Recibió zz_test María ${s}`, { exact: true }).waitFor();
    });
    await paso('Sofi lo ve en la OT: la remisión firmada, quién recibió, el cargo y quién lo cargó', async () => {
      // La foto sube aparte: se espera a que quede SUBIDO.
      for (let i = 0; i < 30; i++) {
        const [f] = await sql`SELECT 1 FROM archivo ar JOIN hoja_ruta_parada pa ON pa.id = ar.parada_id
                              WHERE pa.orden_trabajo_id = ${otId} AND ar.tipo = 'REMISION_PARADA' AND ar.estado = 'SUBIDO'`;
        if (f) break;
        await new Promise((r) => setTimeout(r, 500));
      }
      await ps.reload();
      const sec = ps.getByTestId('seccion-entrega');
      await sec.getByText(`zz_test María ${s}`).waitFor();
      await sec.getByText('(encargada)', { exact: false }).waitFor();
      await sec.getByText(`cargó zz_test_Carlos17 ${s}`, { exact: false }).waitFor();
      await sec.getByAltText('Remisión firmada').waitFor();
    });
    await paso('el cliente lo ve en su portal (Mis trabajos), sin la foto', async () => {
      await cliente.goto(`${B}/portal#t=${token}`);
      await cliente.getByRole('tab', { name: /trabajos/i }).click();
      await cliente.getByText(`Recibió: zz_test María ${s} (encargada)`, { exact: false }).waitFor();
      if (await cliente.getByAltText('Remisión firmada').count()) throw new Error('el portal muestra la foto');
    });
    if (errores.length) throw new Error(errores.join(' | '));
    console.log(`\n>>> RECORRIDO ENTREGA (CA-17.6) EN VERDE: ${n}/${n} PASOS OK <<<\n`);
  } finally {
    await browser.close();
    if (personaId) await sql`UPDATE persona SET activo = false WHERE id = ${personaId}`;
    for (const u of usuarios) await sql`UPDATE usuario SET activo = false WHERE username = ${u}`;
    await sql.end({ timeout: 3 });
  }
})().catch(() => process.exit(1));
