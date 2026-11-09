/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console, process, fetch */
/**
 * Recorrido L9.E2: el cliente pide desde el portal → Sofi lo convierte en PRESUPUESTO desde la bandeja →
 * el cliente ve "Presupuestando" → se cotiza, envía y aprueba → el cliente ve la OT ("Recibido") y,
 * cuando pasa a taller, "En producción". La bandeja interna muestra "PRE → OT".
 * Uso: node scripts/prueba-seguimiento-pedido.cjs   (BASE_URL y CHROMIUM_PATH opcionales)
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
  const sofi = `zz_test_sofi92_${s}`;
  const opciones = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : process.platform === 'win32' ? { channel: 'chrome' } : {};
  const browser = await chromium.launch(opciones);
  const oficina = await (await browser.newContext()).newPage();
  const cliente = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
  for (const p of [oficina, cliente]) p.setDefaultTimeout(12000);
  const errores = [];
  oficina.on('pageerror', (e) => errores.push(e.message));
  cliente.on('pageerror', (e) => errores.push(e.message));
  let n = 0;
  const paso = async (t, fn) => {
    n += 1;
    try { await fn(); console.log('OK  ', n, t); } catch (e) {
      console.log('FALLA', n, t, '->', e.message.split('\n')[0]);
      await oficina.screenshot({ path: `prueba-seguimiento-oficina-${n}.png` });
      await cliente.screenshot({ path: `prueba-seguimiento-cliente-${n}.png` });
      throw e;
    }
  };
  // Pedidos a la API con la sesión de Sofi (pasos de cotización que no son el objeto de este recorrido).
  const api = (method, path, body) => oficina.evaluate(async ([m, p, b]) => {
    const r = await fetch(p, { method: m, headers: b ? { 'content-type': 'application/json' } : {}, body: b ? JSON.stringify(b) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${m} ${p} ${r.status} ${JSON.stringify(j)}`);
    return j;
  }, [method, path, body]);
  const estadoEnPortal = async (texto) => {
    await cliente.reload();
    await cliente.getByTestId('portal-pedidos').getByText(texto, { exact: true }).waitFor();
  };
  let cli, presupuestoId, ot;
  try {
    await paso('fixtures: Sofi (comercial), cliente con local y enlace del portal', async () => {
      const [u] = await sql`INSERT INTO usuario (username, password_hash) VALUES (${sofi}, ${await hashearPassword('Password123!')}) RETURNING id`;
      await sql`INSERT INTO permiso_capacidad (usuario_id, capacidad) VALUES (${u.id}, 'comercial')`;
      await oficina.goto(B + '/login');
      await oficina.getByPlaceholder('Nombre de usuario').fill(sofi);
      await oficina.locator('input[type=password]').fill('Password123!');
      await oficina.getByRole('button', { name: /Iniciar sesión/ }).click();
      await oficina.waitForURL(/\/inicio/);
      const c = await api('POST', '/api/clientes', { nombre: `zz_test_cli92_${s}` });
      const l = await api('POST', `/api/clientes/${c.id}/sucursales`, { nombre: 'Local Luque', gpsLat: -25.27, gpsLng: -57.49 });
      cli = { id: c.id, local: l.id };
      const acc = await api('POST', '/api/portal-accesos', { clienteId: c.id, descripcion: 'zz_test compras' });
      await cliente.goto(`${B}/portal#t=${acc.token}`);
      await cliente.getByText(`zz_test_cli92_${s}`).waitFor();
    });
    await paso('el cliente pide un cartel nuevo y lo ve "Recibido"', async () => {
      await cliente.getByLabel(/Local/).selectOption({ label: 'Local Luque' });
      await cliente.getByPlaceholder(/cambiar la lona/).fill(`zz_test cartel nuevo ${s}`);
      await cliente.getByRole('button', { name: 'Enviar pedido' }).click();
      await cliente.getByTestId('portal-pedidos').getByText('Recibido', { exact: true }).waitFor();
    });
    await paso('Sofi lo convierte en presupuesto desde la bandeja y el cliente ve "Presupuestando"', async () => {
      await oficina.goto(`${B}/pedidos?q=${s}`);
      await oficina.getByText(`zz_test cartel nuevo ${s}`).click();
      await oficina.getByRole('button', { name: /Crear presupuesto/ }).click();
      await oficina.getByText(/Pedido convertido|presupuesto/i).first().waitFor();
      const [pe] = (await api('GET', `/api/pedidos?q=${s}`)).items;
      presupuestoId = pe.presupuesto_id;
      await estadoEnPortal('Presupuestando');
    });
    await paso('se cotiza, se envía y se aprueba: el cliente ve la OT "Recibido", ya no "Presupuestando"', async () => {
      await api('POST', `/api/presupuestos/${presupuestoId}/items`, { sucursalId: cli.local, concepto: 'MATERIAL', descripcion: 'Cartel', cantidad: 1, unidad: 'UNIDAD', precioUnitarioGs: 800000 });
      await api('POST', `/api/presupuestos/${presupuestoId}/enviar`, { desde: 'BORRADOR' });
      ot = (await api('POST', `/api/presupuestos/${presupuestoId}/aprobar`, { desde: 'ENVIADO', comentario: 'zz_test OC' })).ots[0];
      await estadoEnPortal('Recibido');
      await cliente.getByText(`Trabajo ${ot.codigo_ot}`).waitFor();
    });
    await paso('la OT pasa a taller: el cliente ve "En producción"', async () => {
      await api('POST', `/api/comercial/ot/${ot.id}/transicionar`, { desde: 'PENDIENTE', a: 'EN_TALLER' });
      await estadoEnPortal('En producción');
    });
    await paso('la bandeja interna muestra la OT que sigue el pedido', async () => {
      await oficina.goto(`${B}/pedidos?q=${s}`);
      await oficina.getByText(ot.codigo_ot).waitFor();
    });
    if (errores.length) throw new Error(errores.join(' | '));
    console.log(`\n>>> RECORRIDO SEGUIMIENTO DEL PEDIDO EN VERDE: ${n}/${n} PASOS OK <<<\n`);
  } finally {
    await browser.close();
    await sql`UPDATE usuario SET activo = false WHERE username = ${sofi}`;
    await sql.end({ timeout: 3 });
  }
})().catch(() => process.exit(1));
