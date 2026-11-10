/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console, process */
/**
 * Recorrido L5 (error reportado por el usuario 2026-11-10): en "Compartido" el casillero de m² aplastaba
 * el nombre de la OT y del cliente (no se veía a qué OT correspondía cada casillero).
 * Edu (celular 375 px) con dos impresiones de clientes distintos: abre Compartido, ve cada OT con su cliente,
 * reparte 5 m² entre 2 y 1,5 m² de piezas y la oficina ve las dos partes en el material de cada OT.
 * Uso: node scripts/prueba-compartido.cjs   (BASE_URL y CHROMIUM_PATH opcionales)
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
  const edu = `zz_test_educ_${s}`;
  const material = `zz_test Lona ${s}`;
  const opciones = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : process.platform === 'win32' ? { channel: 'chrome' } : {};
  const browser = await chromium.launch(opciones);
  const page = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
  page.setDefaultTimeout(12000);
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  let n = 0;
  let personaId;
  const ots = [];
  const paso = async (t, fn) => {
    n += 1;
    try { await fn(); console.log('OK  ', n, t); } catch (e) {
      console.log('FALLA', n, t, '->', e.message.split('\n')[0]);
      await page.screenshot({ path: `prueba-compartido-falla-${n}.png` });
      throw e;
    }
  };
  try {
    await paso('fixture: Edu con dos impresiones de clientes distintos y la lona a 18.000', async () => {
      const [u] = await sql`INSERT INTO usuario (username, password_hash) VALUES (${edu}, ${await hashearPassword('Password123!')}) RETURNING id`;
      await sql`INSERT INTO permiso_capacidad (usuario_id, capacidad) VALUES (${u.id}, 'taller')`;
      const [p] = await sql`INSERT INTO persona (nombre, ci) VALUES (${'zz_test_Edu ' + s}, ${'C5' + s}) RETURNING id`;
      personaId = p.id;
      await sql`UPDATE usuario SET persona_id = ${p.id} WHERE id = ${u.id}`;
      const [i] = await sql`INSERT INTO insumo (nombre, unidad) VALUES (${material}, 'M2') RETURNING id`;
      await sql`INSERT INTO insumo_precio (insumo_id, costo_unitario_gs) VALUES (${i.id}, 18000)`;
      for (const [k, cli] of [['A', 'Farmacia'], ['B', 'Super']]) {
        const [c] = await sql`INSERT INTO cliente (codigo, nombre) VALUES (${`C5${k}-` + s}, ${`zz_test ${cli} ${s}`}) RETURNING id`;
        const [ot] = await sql`INSERT INTO orden_trabajo (codigo_ot, cliente_id, titulo, creado_por) VALUES (${`OT5${k}-` + s}, ${c.id}, ${'zz_test lona ' + k}, ${u.id}) RETURNING id, codigo_ot`;
        ots.push(ot);
        await sql`INSERT INTO tarea (orden_trabajo_id, persona_asignada_id, tipo, descripcion, orden_secuencia, estado, creado_por)
                  VALUES (${ot.id}, ${p.id}, 'TALLER_IMPRESION', ${'zz_test imprimir ' + k}, 1, 'PENDIENTE', ${u.id})`;
      }
      await page.goto(B + '/login');
      await page.getByPlaceholder('Nombre de usuario').fill(edu);
      await page.locator('input[type=password]').fill('Password123!');
      await page.getByRole('button', { name: /Iniciar sesión/ }).click();
      await page.waitForURL(/\/mi-trabajo/);
    });
    await paso('Compartido muestra cada OT con su cliente al lado del casillero', async () => {
      await page.getByRole('button', { name: /Compartido/ }).first().click();
      const dlg = page.getByRole('dialog');
      for (const [ot, cli] of [[ots[0], 'Farmacia'], [ots[1], 'Super']]) {
        const etiqueta = dlg.getByText(`${ot.codigo_ot} · zz_test ${cli} ${s}`);
        await etiqueta.waitFor();
        const caja = await etiqueta.boundingBox();
        if (!caja || caja.width < 60) throw new Error(`el nombre de ${ot.codigo_ot} no se ve (ancho ${caja ? caja.width : 0}px)`);
      }
    });
    await paso('reparte 5 m² entre 2 y 1,5 m² de piezas', async () => {
      const dlg = page.getByRole('dialog');
      await dlg.getByPlaceholder('Buscar material…').fill(material);
      await page.getByText(material).last().click();
      await dlg.getByLabel(/Cantidad total usada/).fill('5');
      await dlg.getByLabel(`m² ${ots[0].codigo_ot}`).fill('2');
      await dlg.getByLabel(`m² ${ots[1].codigo_ot}`).fill('1,5');
      await dlg.getByRole('button', { name: 'Repartir y cargar' }).click();
      await page.getByText(/Repartido: 2,857\d? \/ 2,142\d?|Repartido: 2\.857\d? \/ 2\.142\d?/).waitFor();
    });
    await paso('en la base: cada OT tiene su parte y suman 5 m²', async () => {
      const filas = await sql`SELECT orden_trabajo_id, cantidad::float8 AS c FROM consumo_insumo WHERE orden_trabajo_id IN (${ots[0].id}, ${ots[1].id}) ORDER BY c DESC`;
      const total = filas.reduce((a, f) => a + f.c, 0);
      if (filas.length !== 2 || Math.abs(total - 5) > 1e-9 || filas[0].orden_trabajo_id !== ots[0].id) throw new Error(JSON.stringify(filas));
    });
    if (errores.length) throw new Error(errores.join(' | '));
    console.log(`\n>>> RECORRIDO COMPARTIDO EN VERDE: ${n}/${n} PASOS OK <<<\n`);
  } finally {
    await browser.close();
    if (personaId) await sql`UPDATE persona SET activo = false WHERE id = ${personaId}`;
    await sql`UPDATE usuario SET activo = false WHERE username = ${edu}`;
    await sql`UPDATE insumo SET activo = false WHERE nombre = ${material}`;
    await sql.end({ timeout: 3 });
  }
})().catch(() => process.exit(1));
