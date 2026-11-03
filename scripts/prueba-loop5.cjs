/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console, process, document */
/**
 * Recorrido del Loop 5 en navegador: Juan da de alta dos insumos → Edu, desde "Mi trabajo", carga la merma de una
 * impresión (vista previa 65,8 %) y unos ojales sin ver ningún precio → Juan ve el material en la OT (total y desperdicio exactos),
 * corrige una línea con motivo y cambia un precio sin que cambie lo ya cargado.
 *
 * Uso: node scripts/prueba-loop5.cjs   (BASE_URL y CHROMIUM_PATH opcionales)
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
      await page.screenshot({ path: `prueba-loop5-falla-${n}.png` });
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

  const total = () => page.getByTestId('total-material').textContent();
  const insumos = [];
  try {
    let otId;
    const LONA = 'zz_test Lona ' + s;
    const OJAL = 'zz_test Ojal ' + s;
    await paso('fixtures: Juan (admin), Edu (taller, persona) y OT con tarea de impresión para Edu', async () => {
      const juan = await usuario(`zz_test_juan_${s}`, 'admin');
      const [p] = await sql`INSERT INTO persona (nombre, ci) VALUES (${'zz_test_Edu ' + s}, ${'CIE' + s}) RETURNING id`;
      personaId = p.id;
      await usuario(`zz_test_edu_${s}`, 'taller', p.id);
      const [c] = await sql`INSERT INTO cliente (codigo, nombre) VALUES (${'Z5' + s}, ${'zz_test_cli5 ' + s}) RETURNING id`;
      clienteId = c.id;
      const [ot] = await sql`
        INSERT INTO orden_trabajo (codigo_ot, cliente_id, titulo, creado_por) VALUES (${'OT-Z5-' + s}, ${c.id}, ${'zz_test Lona fachada ' + s}, ${juan}) RETURNING id
      `;
      otId = ot.id;
      await sql`INSERT INTO ot_evento (orden_trabajo_id, estado_nuevo, autor_id) VALUES (${ot.id}, 'PENDIENTE', ${juan})`;
      await sql`
        INSERT INTO tarea (orden_trabajo_id, persona_asignada_id, tipo, descripcion, orden_secuencia, creado_por)
        VALUES (${ot.id}, ${p.id}, 'TALLER_IMPRESION', 'Imprimir lona', 1, ${juan})
      `;
    });

    await paso('Juan da de alta Lona (m², Gs 35.000) y Ojal (u., Gs 500) en Insumos', async () => {
      await entrar(`zz_test_juan_${s}`);
      await page.getByRole('link', { name: 'Insumos' }).click();
      await page.waitForURL(/\/insumos/);
      for (const [nombre, unidad, costo] of [[LONA, 'm²', '35000'], [OJAL, 'u.', '500']]) {
        await page.getByLabel('Nombre del insumo').fill(nombre);
        await page.getByLabel('Unidad').selectOption({ label: unidad });
        await page.getByLabel('Costo unitario').fill(costo);
        await page.getByRole('button', { name: 'Agregar insumo' }).click();
        await page.getByText(`Insumo "${nombre}" agregado.`).waitFor();
      }
      for (const r of await sql`SELECT id FROM insumo WHERE nombre IN (${LONA}, ${OJAL})`) insumos.push(r.id);
      if (insumos.length !== 2) throw new Error('No se crearon los dos insumos');
    });

    const elegir = async (nombre) => {
      await page.getByPlaceholder(/Buscar material|Material \(ej/).first().fill(nombre.slice(-12));
      await page.getByRole('button', { name: new RegExp(nombre) }).first().click();
    };

    await paso('Edu carga la merma desde Mi trabajo: 1,52 × 2 m, 2 piezas de 1 × 1 → 65,8 % aprovechado', async () => {
      await entrar(`zz_test_edu_${s}`);
      await page.waitForURL(/\/mi-trabajo/);
      await page.getByRole('button', { name: /Merma/ }).first().click();
      await elegir(LONA);
      await page.locator('#mermaAncho').fill('1,52');
      await page.locator('#mermaLargo').fill('2');
      await page.getByLabel('Ancho pieza 1').fill('1');
      await page.getByLabel('Alto pieza 1').fill('1');
      await page.getByLabel('Cantidad pieza 1').fill('2');
      await page.getByTestId('resultado-merma').getByText('65.8 %').waitFor();
      if (await page.getByRole('dialog').getByText(/Gs\./).count()) throw new Error('Edu ve precios');
      await page.getByRole('button', { name: 'Cargar consumo' }).click();
      await page.getByText(/65\.8 % aprovechado/).waitFor();
    });

    await paso('Edu carga 10 ojales con "Material"', async () => {
      await page.getByRole('button', { name: /^Material$/ }).first().click();
      await elegir(OJAL);
      await page.locator('#materialCantidad').fill('10');
      await page.getByRole('button', { name: /^Cargar$/ }).click();
      await page.getByText(/Cargado: 10 u\./).waitFor();
      if (await page.getByText(/Gs\./).count()) throw new Error('Edu ve precios en Mi trabajo');
    });

    await paso('Juan ve en la OT: total Gs 111.400 (70.000 + 36.400 de desperdicio + 5.000)', async () => {
      await entrar(`zz_test_juan_${s}`);
      await page.goto(B + `/ots/${otId}`);
      await page.getByTestId('seccion-material').getByText(LONA).first().waitFor();
      const t = await total();
      if (!/111\.400/.test(t)) throw new Error('Total inesperado: ' + t);
      await page.getByTestId('seccion-material').getByText(/36\.400/).first().waitFor();
    });

    await paso('Juan corrige la línea de ojales con motivo → total Gs 106.400', async () => {
      const fila = page.locator('tr', { hasText: OJAL });
      await fila.getByRole('button', { name: 'Corregir' }).click();
      await page.getByLabel('Motivo de la corrección').fill('Eran 10 de otra OT');
      await page.getByRole('button', { name: 'Anular' }).click();
      await page.getByText(/se cargó el negativo/).waitFor();
      await page.waitForFunction(() => /106\.400/.test(document.querySelector('[data-testid=total-material]')?.textContent || ''));
    });

    await paso('Juan sube el precio de la lona y lo ya cargado no cambia', async () => {
      await page.goto(B + '/insumos');
      await page.getByLabel('Buscar insumo').fill(LONA);
      await page.locator('div.flex-wrap', { hasText: LONA }).getByRole('button', { name: /35\.000/ }).click();
      await page.getByLabel(`Nuevo costo ${LONA}`).fill('40000');
      await page.getByRole('button', { name: 'Guardar' }).click();
      await page.getByText(/Nuevo precio de/).waitFor();
      await page.goto(B + `/ots/${otId}`);
      await page.getByTestId('total-material').waitFor();
      const t = await total();
      if (!/106\.400/.test(t)) throw new Error('El precio nuevo cambió lo cargado: ' + t);
    });

    if (errores.length) throw new Error(errores.join(' | '));
    console.log(`\n>>> RECORRIDO LOOP 5 EN VERDE: ${n}/${n} PASOS OK <<<\n`);
  } finally {
    await browser.close();
    if (usuarios.length) await sql`UPDATE usuario SET activo = false WHERE id = ANY(${usuarios}::uuid[])`;
    if (personaId) await sql`UPDATE persona SET activo = false WHERE id = ${personaId}`;
    if (clienteId) await sql`UPDATE cliente SET activo = false WHERE id = ${clienteId}`;
    if (insumos.length) await sql`UPDATE insumo SET activo = false WHERE id = ANY(${insumos}::uuid[])`;
    await sql.end({ timeout: 3 });
  }
})().catch(() => process.exit(1));
