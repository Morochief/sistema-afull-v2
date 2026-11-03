/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console, process */
/**
 * Recorrido del Loop 9 en navegador: Sofi genera el enlace del portal desde el cliente → el cliente (otro navegador,
 * sin sesión) carga un pedido para su local → Sofi lo convierte en OT desde "Pedidos" → el cliente ve el trabajo
 * con el estado en sus palabras → Sofi revoca el enlace y el cliente ya no entra.
 *
 * Uso: node scripts/prueba-loop9.cjs   (BASE_URL y CHROMIUM_PATH opcionales)
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
      await page.screenshot({ path: `prueba-loop9-falla-${n}.png` });
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

  const clientes = [];
  try {
    let clienteId, enlace, numero, cliente;
    await paso('fixtures: Sofi (comercial) y un cliente con dos locales', async () => {
      await usuario(`zz_test_sofi9_${s}`, 'comercial');
      const [c] = await sql`INSERT INTO cliente (codigo, nombre) VALUES (${'Z9' + s}, ${'zz_test_Cadena ' + s}) RETURNING id`;
      clienteId = c.id;
      clientes.push(c.id);
      await sql`INSERT INTO sucursal (cliente_id, nombre, gps_lat, gps_lng) VALUES (${c.id}, 'Local Centro', -25.28, -57.63), (${c.id}, 'Local Luque', -25.27, -57.49)`;
    });

    await paso('Sofi genera el enlace del portal desde el detalle del cliente', async () => {
      await entrar(`zz_test_sofi9_${s}`);
      await page.goto(B + `/clientes/${clienteId}`);
      const sec = page.getByTestId('seccion-portal');
      await sec.getByLabel('Enlace para').fill('Compras');
      await sec.getByRole('button', { name: 'Generar enlace' }).click();
      enlace = await sec.getByLabel('Enlace generado').inputValue();
      if (!/\/portal#t=[A-Za-z0-9_-]{43}$/.test(enlace)) throw new Error('Enlace inesperado: ' + enlace);
    });

    await paso('El cliente abre el enlace en otro navegador (sin sesión): ve su nombre y el token sale de la barra', async () => {
      cliente = await browser.newPage();
      cliente.setDefaultTimeout(12000);
      cliente.on('pageerror', (e) => errores.push(e.message));
      await cliente.goto(enlace);
      await cliente.getByRole('heading', { name: 'zz_test_Cadena ' + s }).waitFor();
      if (cliente.url().includes('#t=')) throw new Error('El token quedó en la barra');
    });

    await paso('El cliente pide un cambio de lona para "Local Luque"', async () => {
      await cliente.locator('#pedidoLocal').selectOption({ label: 'Local Luque' });
      await cliente.locator('#pedidoDescripcion').fill('Cambiar lona del frente 3 x 1 m ' + s);
      await cliente.getByRole('button', { name: 'Enviar pedido' }).click();
      await cliente.getByText(/Recibimos tu pedido PED-/).waitFor();
      const item = cliente.getByTestId('portal-pedidos').locator('li', { hasText: 'Cambiar lona del frente 3 x 1 m ' + s });
      await item.getByText('Recibido').waitFor();
      numero = (await item.locator('span.font-mono').textContent()).split(' ')[0];
    });

    await paso('Sofi ve el pedido en "Pedidos" y lo convierte en OT', async () => {
      await page.getByRole('link', { name: 'Pedidos' }).click();
      await page.waitForURL(/\/pedidos/);
      await page.getByPlaceholder(/Buscar por número/).fill(numero);
      await page.getByText(numero).first().click();
      await page.getByRole('button', { name: 'Crear OT' }).click();
      await page.waitForURL(/\/ots\/[0-9a-f-]{36}/);
      await page.getByText('Local Luque').first().waitFor();
    });

    await paso('El cliente ve el pedido convertido y el trabajo "Recibido" en la pestaña Trabajos', async () => {
      await cliente.reload();
      const item = cliente.getByTestId('portal-pedidos').locator('li', { hasText: numero });
      await item.getByText(/Trabajo OT-/).waitFor();
      await cliente.getByRole('tab', { name: 'Trabajos' }).click();
      await cliente.getByTestId('portal-trabajos').getByText('Recibido').first().waitFor();
      if (await cliente.getByText(/Gs\./).count()) throw new Error('El cliente ve montos');
    });

    await paso('Sofi revoca el enlace y el cliente ya no entra', async () => {
      await page.goto(B + `/clientes/${clienteId}`);
      await page.getByTestId('seccion-portal').getByRole('button', { name: 'Revocar' }).click();
      await page.getByText('Enlace revocado.').waitFor();
      await cliente.reload();
      await cliente.getByText(/Este enlace no es válido o ya venció/).waitFor();
    });

    if (errores.length) throw new Error(errores.join(' | '));
    console.log(`\n>>> RECORRIDO LOOP 9 EN VERDE: ${n}/${n} PASOS OK <<<\n`);
  } finally {
    await browser.close();
    if (usuarios.length) await sql`UPDATE usuario SET activo = false WHERE id = ANY(${usuarios}::uuid[])`;
    if (clientes.length) await sql`UPDATE cliente SET activo = false WHERE id = ANY(${clientes}::uuid[])`;
    await sql.end({ timeout: 3 });
  }
})().catch(() => process.exit(1));
