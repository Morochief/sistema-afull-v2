/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console, process */
/**
 * Recorrido CA-21.8 (Loop 21): Juan carga los datos de aFull → Sofía carga una factura → la cobra con un recibo
 * (transferencia, con retención) → ve el recibo A4 con el importe en letras → el cliente lo ve en su portal →
 * Sofía lo anula y la factura vuelve a tener saldo.
 * Uso: node scripts/prueba-recibos.cjs   (BASE_URL y CHROMIUM_PATH opcionales)
 */
const { chromium } = require('playwright');
const postgres = require('postgres');
const crypto = require('node:crypto');
const { config } = require('dotenv');

config({ path: ['.env', '.env.test'] });
const B = process.env.BASE_URL || 'http://localhost:5173';

(async () => {
  const sql = postgres(process.env.DATABASE_URL_ADMIN, { max: 1, prepare: false });
  const { hashearPassword } = await import('../apps/api/dist/modules/auth/password.js');
  const s = Math.random().toString(36).slice(2, 7);
  const usuarios = [`zz_test_juan21_${s}`, `zz_test_sofi21_${s}`];
  const cliente = `zz_test_cli21_${s}`;
  const nroFactura = `001-0${String(Math.floor(Math.random() * 90) + 10)}-${String(Math.floor(Math.random() * 9e6)).padStart(7, '0')}`;
  const opciones = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : process.platform === 'win32' ? { channel: 'chrome' } : {};
  const browser = await chromium.launch(opciones);
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'America/Asuncion' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  let n = 0;
  let empresaAntes = null;
  let clienteId;
  const paso = async (t, fn) => {
    n += 1;
    try { await fn(); console.log('OK  ', n, t); } catch (e) {
      console.log('FALLA', n, t, '->', e.message.split('\n')[0]);
      await page.screenshot({ path: `prueba-recibos-falla-${n}.png` });
      throw e;
    }
  };
  const entrar = async (user, destino) => {
    await ctx.clearCookies();
    await page.goto(B + '/login');
    await page.getByPlaceholder('Nombre de usuario').fill(user);
    await page.locator('input[type=password]').fill('Password123!');
    await page.getByRole('button', { name: /Iniciar sesión/ }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'));
    await page.goto(B + destino);
  };
  try {
    await paso('fixture: Juan (admin), Sofía (comercial) y un cliente con RUC', async () => {
      [empresaAntes] = await sql`SELECT * FROM empresa_dato WHERE id = ${1}`;
      const hash = await hashearPassword('Password123!');
      for (const [u, cap] of [[usuarios[0], 'admin'], [usuarios[1], 'comercial']]) {
        const [x] = await sql`INSERT INTO usuario (username, password_hash) VALUES (${u}, ${hash}) RETURNING id`;
        await sql`INSERT INTO permiso_capacidad (usuario_id, capacidad) VALUES (${x.id}, ${cap})`;
      }
      const [c] = await sql`INSERT INTO cliente (codigo, nombre, ruc) VALUES (${'C21-' + s}, ${cliente}, ${'21' + String(Date.now()).slice(-6) + '-8'}) RETURNING id`;
      clienteId = c.id;
    });
    await paso('Juan carga los datos de aFull para el encabezado', async () => {
      await entrar(usuarios[0], '/cobranzas/empresa');
      await page.locator('#emp-razonSocial').fill('zz_test aFull S.A.');
      await page.locator('#emp-ruc').fill('80099999-1');
      await page.locator('#emp-ciudad').fill('Asunción');
      await page.getByRole('button', { name: 'Guardar' }).click();
      await page.getByText('Datos guardados. Ya salen en los recibos.').waitFor();
    });
    await paso('Sofía no ve la pestaña "Datos de aFull" y carga la factura', async () => {
      await entrar(usuarios[1], '/cobranzas');
      await page.getByRole('heading', { name: 'Cobranzas' }).waitFor();
      if (await page.getByRole('tab', { name: 'Datos de aFull' }).count()) throw new Error('comercial ve Datos de aFull');
      await page.getByRole('button', { name: 'Cargar factura' }).click();
      await page.getByPlaceholder('Buscar cliente por nombre o RUC...').fill(cliente);
      await page.getByText(cliente).first().click();
      await page.locator('#fNumero').fill(nroFactura);
      await page.locator('#fMonto').fill('342.999');
      await page.locator('form').getByRole('button', { name: 'Cargar factura' }).click();
      await page.getByText(`Factura ${nroFactura} cargada.`).waitFor();
      await page.getByRole('row', { name: new RegExp(nroFactura) }).getByText('Pendiente').waitFor();
    });
    await paso('la cobra con retención: el modal muestra el importe en letras y abre el recibo', async () => {
      await page.getByRole('row', { name: new RegExp(nroFactura) }).getByRole('button', { name: 'Cobrar' }).click();
      await page.getByLabel(`Monto ${nroFactura}`).waitFor();
      if ((await page.getByLabel(`Monto ${nroFactura}`).inputValue()) !== '342.999') throw new Error('no trajo el saldo');
      await page.locator('#rBanco').fill('Itaú');
      await page.locator('#rRef').fill('TRX-' + s);
      await page.locator('#rRet').fill('21.500');
      await page.getByText('trescientos veintiún mil cuatrocientos noventa y nueve guaraníes').waitFor();
      await page.getByRole('button', { name: 'Emitir recibo' }).click();
      await page.waitForURL(/\/cobranzas\/recibos\/[0-9a-f-]{36}$/);
    });
    await paso('el recibo A4 tiene lo del de Prosegur', async () => {
      for (const t of ['RECIBO DE DINERO', 'RUC: 80099999-1', cliente, 'Gs. 321.499', nroFactura, 'Cobrador Autorizado']) {
        await page.getByText(t, { exact: false }).first().waitFor();
      }
      await page.getByText('trescientos veintiún mil cuatrocientos noventa y nueve guaraníes').waitFor();
      await page.getByRole('button', { name: 'Imprimir / Guardar PDF' }).waitFor();
    });
    await paso('el cliente lo ve en su portal (sin la nota interna)', async () => {
      const token = crypto.randomBytes(32).toString('base64url');
      const [u] = await sql`SELECT id FROM usuario WHERE username = ${usuarios[1]}`;
      await sql`INSERT INTO portal_acceso (cliente_id, descripcion, token_hash, expira_at, creado_por)
                VALUES (${clienteId}, ${'zz_test compras'}, ${crypto.createHash('sha256').update(token).digest('hex')}, now() + interval '1 day', ${u.id})`;
      const pp = await ctx.newPage();
      await pp.goto(`${B}/portal#t=${token}`);
      await pp.getByRole('tab', { name: 'Recibos' }).click();
      await pp.getByText('321.499').first().click();
      await pp.getByText('Cobrador Autorizado').waitFor();
      await pp.getByText('trescientos veintiún mil cuatrocientos noventa y nueve guaraníes').waitFor();
      await pp.close();
    });
    await paso('Sofía anula el recibo: sale ANULADO y la factura vuelve a Pendiente', async () => {
      await page.getByRole('button', { name: 'Anular recibo' }).click();
      await page.locator('#anMotivo').fill('zz_test transferencia rebotada');
      await page.getByRole('button', { name: 'Anular', exact: true }).click();
      await page.getByLabel('Recibo anulado').waitFor();
      await page.goto(B + '/cobranzas');
      await page.getByRole('row', { name: new RegExp(nroFactura) }).getByText('Pendiente').waitFor();
    });
    if (errores.length) throw new Error(errores.join(' | '));
    console.log(`\n>>> RECORRIDO RECIBOS DE DINERO (CA-21.8) EN VERDE: ${n}/${n} PASOS OK <<<\n`);
  } finally {
    await browser.close();
    // Deja los datos de aFull como estaban (o sin datos, si no había).
    if (empresaAntes) {
      const e = empresaAntes;
      await sql`UPDATE empresa_dato SET razon_social = ${e.razon_social}, ruc = ${e.ruc}, direccion = ${e.direccion}, ciudad = ${e.ciudad},
                telefono = ${e.telefono}, email = ${e.email} WHERE id = ${1}`;
    } else {
      await sql`DELETE FROM empresa_dato WHERE id = ${1} AND razon_social = ${'zz_test aFull S.A.'}`;
    }
    if (clienteId) {
      await sql`UPDATE portal_acceso SET activo = false WHERE cliente_id = ${clienteId}`;
      await sql`UPDATE cliente SET activo = false WHERE id = ${clienteId}`;
    }
    for (const u of usuarios) await sql`UPDATE usuario SET activo = false WHERE username = ${u}`;
    await sql.end({ timeout: 3 });
  }
})().catch(() => process.exit(1));
