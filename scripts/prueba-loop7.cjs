/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console, process */
/**
 * Recorrido del Loop 7 en navegador: Nachi carga el enlace de Drive desde "Mi trabajo" → Edu todavía no lo ve
 * → Sofi lo aprueba desde la OT → Edu lo ve en "Diseños / Para producir" con el botón "Abrir en Drive".
 *
 * Uso: node scripts/prueba-loop7.cjs   (BASE_URL y CHROMIUM_PATH opcionales)
 */
const { chromium } = require('playwright');
const postgres = require('postgres');
const { config } = require('dotenv');

config({ path: ['.env', '.env.test'] });
const B = process.env.BASE_URL || 'http://localhost:5173';
const DRIVE = 'https://drive.google.com/file/d/zz_test_ruleta/view?usp=drive_link';

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
  let personaId = null;
  let clienteId = null;
  let n = 0;
  const paso = async (t, fn) => {
    n += 1;
    try {
      await fn();
      console.log('OK  ', n, t);
    } catch (e) {
      console.log('FALLA', n, t, '->', e.message.split('\n')[0]);
      await page.screenshot({ path: `prueba-loop7-falla-${n}.png` });
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

  try {
    let otId;
    await paso('fixtures: Sofi, Nachi (persona), Edu y OT con tarea de diseño para Nachi', async () => {
      const sofi = await usuario(`zz_test_sofi_${s}`, 'comercial');
      const [p] = await sql`INSERT INTO persona (nombre, ci) VALUES (${'zz_test_Nachi ' + s}, ${'CIN' + s}) RETURNING id`;
      personaId = p.id;
      await usuario(`zz_test_nachi_${s}`, 'diseno', p.id);
      await usuario(`zz_test_edu_${s}`, 'taller');
      const [c] = await sql`INSERT INTO cliente (codigo, nombre) VALUES (${'Z7' + s}, ${'zz_test_Frutos ' + s}) RETURNING id`;
      clienteId = c.id;
      const [ot] = await sql`
        INSERT INTO orden_trabajo (codigo_ot, cliente_id, titulo, creado_por) VALUES (${'OT-Z7-' + s}, ${c.id}, ${'zz_test Ruleta Segafredo ' + s}, ${sofi}) RETURNING id
      `;
      otId = ot.id;
      await sql`INSERT INTO ot_evento (orden_trabajo_id, estado_nuevo, autor_id) VALUES (${ot.id}, 'PENDIENTE', ${sofi})`;
      await sql`
        INSERT INTO tarea (orden_trabajo_id, persona_asignada_id, tipo, descripcion, orden_secuencia, creado_por)
        VALUES (${ot.id}, ${p.id}, 'DISENO', 'Diseño ruleta', 1, ${sofi})
      `;
    });

    await paso('Nachi entra, va a Mi trabajo y carga el enlace de Drive', async () => {
      await entrar(`zz_test_nachi_${s}`);
      await page.waitForURL(/\/mi-trabajo/);
      await page.getByRole('button', { name: /Cargar enlace del diseño/ }).first().click();
      await page.locator('#disenoUrl').fill(DRIVE);
      await page.locator('#disenoNotas').fill('Ruleta 60 cm de diámetro');
      await page.getByRole('button', { name: /^Cargar diseño$/ }).click();
      await page.getByText(/esperando la verificación/).waitFor();
    });

    await paso('Edu todavía no lo ve en "Para producir"', async () => {
      await entrar(`zz_test_edu_${s}`);
      await page.goto(B + '/disenos');
      await page.getByText(/Para producir/).waitFor();
      await page.waitForTimeout(800);
      if (await page.getByText('zz_test Ruleta Segafredo ' + s).count()) throw new Error('Edu ve un diseño sin aprobar');
    });

    await paso('Sofi lo ve por verificar y lo aprueba desde la OT', async () => {
      await entrar(`zz_test_sofi_${s}`);
      await page.goto(B + '/disenos');
      await page.getByRole('link', { name: 'OT-Z7-' + s }).click();
      await page.waitForURL(new RegExp(`/ots/${otId}`));
      await page.getByRole('button', { name: /Aprobar \(medidas verificadas\)/ }).click();
      await page.getByText(/ya aparece en la cola de taller/).waitFor();
    });

    await paso('Edu lo ve con el botón "Abrir en Drive" apuntando al original', async () => {
      await entrar(`zz_test_edu_${s}`);
      await page.goto(B + '/disenos');
      const fila = page.locator('div', { hasText: 'zz_test Ruleta Segafredo ' + s }).filter({ has: page.getByRole('link', { name: /Abrir en Drive/ }) }).last();
      const href = await fila.getByRole('link', { name: /Abrir en Drive/ }).getAttribute('href');
      if (href !== DRIVE) throw new Error('Enlace inesperado: ' + href);
    });

    if (errores.length) throw new Error(errores.join(' | '));
    console.log(`\n>>> RECORRIDO LOOP 7 EN VERDE: ${n}/${n} PASOS OK <<<\n`);
  } finally {
    await browser.close();
    if (usuarios.length) await sql`UPDATE usuario SET activo = false WHERE id = ANY(${usuarios}::uuid[])`;
    if (personaId) await sql`UPDATE persona SET activo = false WHERE id = ${personaId}`;
    if (clienteId) await sql`UPDATE cliente SET activo = false WHERE id = ${clienteId}`;
    await sql.end({ timeout: 3 });
  }
})().catch(() => process.exit(1));
