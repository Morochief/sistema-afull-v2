/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console, process */
/**
 * Recorrido CA-18.6 (Loop 18 + L18.E2): Edu (celular 375 px) carga el ejemplo real de la reunión en centímetros:
 * adhesivo 137 × 691 cm con mc reservado 87 × 330, isla bob 46 × 686, isla kellogs 90 × 303 y pl mogul 25 × 386,
 * que (según Edu, audio del 17/11) se imprime en el desperdicio de bob y no paga material. Ve el desperdicio
 * (0,7131 m², 92,5 % aprovechado) y su reparto; la oficina ve en cada OT su parte en m².
 * Uso: node scripts/prueba-corte.cjs   (BASE_URL y CHROMIUM_PATH opcionales)
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
  const edu = `zz_test_edu18_${s}`;
  const jefe = `zz_test_jefe18_${s}`;
  const material = `zz_test Adhesivo ${s}`;
  const opciones = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : process.platform === 'win32' ? { channel: 'chrome' } : {};
  const browser = await chromium.launch(opciones);
  const pe = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
  const pj = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const errores = [];
  for (const p of [pe, pj]) { p.setDefaultTimeout(12000); p.on('pageerror', (e) => errores.push(e.message)); }
  let n = 0;
  const personas = [];
  const ots = [];
  const paso = async (t, fn) => {
    n += 1;
    try { await fn(); console.log('OK  ', n, t); } catch (e) {
      console.log('FALLA', n, t, '->', e.message.split('\n')[0]);
      await pe.screenshot({ path: `prueba-corte-falla-${n}-edu.png` });
      await pj.screenshot({ path: `prueba-corte-falla-${n}-oficina.png` });
      throw e;
    }
  };
  const login = async (page, user, destino) => {
    await page.goto(B + '/login');
    await page.getByPlaceholder('Nombre de usuario').fill(user);
    await page.locator('input[type=password]').fill('Password123!');
    await page.getByRole('button', { name: /Iniciar sesión/ }).click();
    await page.waitForURL(destino);
  };
  try {
    await paso('fixture: Edu con dos impresiones (clientes distintos) y el adhesivo a 63.000 el m²', async () => {
      const hash = await hashearPassword('Password123!');
      const usuario = async (username, cap) => {
        const [u] = await sql`INSERT INTO usuario (username, password_hash) VALUES (${username}, ${hash}) RETURNING id`;
        await sql`INSERT INTO permiso_capacidad (usuario_id, capacidad) VALUES (${u.id}, ${cap})`;
        return u.id;
      };
      const uEdu = await usuario(edu, 'taller');
      await usuario(jefe, 'admin');
      const [p] = await sql`INSERT INTO persona (nombre, ci) VALUES (${'zz_test_Edu ' + s}, ${'E18' + s}) RETURNING id`;
      personas.push(p.id);
      await sql`UPDATE usuario SET persona_id = ${p.id} WHERE id = ${uEdu}`;
      const [i] = await sql`INSERT INTO insumo (nombre, unidad) VALUES (${material}, 'M2') RETURNING id`;
      await sql`INSERT INTO insumo_precio (insumo_id, costo_unitario_gs) VALUES (${i.id}, 63000)`;
      for (const [k, cli] of [['A', 'mc reservado'], ['B', 'isla bob'], ['C', 'isla kellogs'], ['D', 'pl mogul']]) {
        const [c] = await sql`INSERT INTO cliente (codigo, nombre) VALUES (${`C18${k}-` + s}, ${`zz_test ${cli} ${s}`}) RETURNING id`;
        const [ot] = await sql`INSERT INTO orden_trabajo (codigo_ot, cliente_id, titulo, creado_por) VALUES (${`OT18${k}-` + s}, ${c.id}, ${'zz_test ' + cli}, ${uEdu}) RETURNING id, codigo_ot`;
        await sql`INSERT INTO tarea (orden_trabajo_id, persona_asignada_id, tipo, descripcion, orden_secuencia, estado, creado_por)
                  VALUES (${ot.id}, ${p.id}, 'TALLER_IMPRESION', ${'zz_test imprimir ' + k}, 1, 'PENDIENTE', ${uEdu})`;
        ots.push({ ...ot, cli });
      }
      await login(pe, edu, /\/mi-trabajo/);
      await login(pj, jefe, /\/inicio/);
    });
    await paso('Edu abre "Medidas (cm)" desde la tarjeta de mc reservado y carga el material', async () => {
      const tarjeta = pe.locator('div.rounded-md', { hasText: `${ots[0].codigo_ot} · zz_test mc reservado` }).filter({ has: pe.getByRole('button', { name: /Iniciar Trabajo/ }) }).last();
      await tarjeta.getByRole('button', { name: /Medidas \(cm\)/ }).click();
      const dlg = pe.getByRole('dialog');
      await dlg.getByPlaceholder('Material (ej. Adhesivo, Lona)…').fill(material);
      await pe.getByText(material).last().click();
      await dlg.getByRole('button', { name: '137', exact: true }).click();
      await dlg.getByLabel('Largo usado (cm)').fill('691');
    });
    await paso('piezas en cm de los cuatro trabajos; mogul "sale del desperdicio" de bob: 92,5 % y 0,7131 m² de desperdicio', async () => {
      const dlg = pe.getByRole('dialog');
      const medidas = [['87', '330'], ['46', '686'], ['90', '303'], ['25', '386']];
      for (const [i, ot] of ots.entries()) {
        if (i > 0) await dlg.getByLabel('Agregar otro trabajo').selectOption({ label: `${ot.codigo_ot} · zz_test ${ot.cli} ${s}` });
        await dlg.getByLabel(`Ancho pieza 1 de ${ot.codigo_ot}`).fill(medidas[i][0]);
        await dlg.getByLabel(`Alto pieza 1 de ${ot.codigo_ot}`).fill(medidas[i][1]);
      }
      // Sin el tilde, las piezas suman más que el adhesivo y no deja cargar.
      await dlg.getByText('Las piezas suman 9,7186 m² y el material 9,4667 m²', { exact: false }).waitFor();
      await dlg.getByLabel(`Material de ${ots[3].codigo_ot}`).selectOption({ label: `Sale del desperdicio de ${ots[1].codigo_ot}` });
      const res = await dlg.getByTestId('resumen-corte').innerText();
      if (!res.includes('9,4667 m²') || !res.includes('0,7131 m²') || !res.includes('92,5 %')) throw new Error(res);
      await dlg.getByTestId(`parte-${ots[1].codigo_ot}`).filter({ hasText: '3,1556 m² + 0,257 m² desperdicio' }).waitFor();
      await dlg.getByTestId(`parte-${ots[3].codigo_ot}`).filter({ hasText: `0,965 m² del desperdicio de ${ots[1].codigo_ot} (sin costo)` }).waitFor();
    });
    await paso('carga: aviso con el total y el aprovechamiento', async () => {
      await pe.getByRole('dialog').getByRole('button', { name: 'Cargar', exact: true }).click();
      await pe.getByText(/Cargado: 8,7536 m² de piezas y 0,7131 m² de desperdicio \(92,5 % aprovechado\)/).waitFor();
    });
    await paso('la oficina ve en cada OT su parte; mogul con sus m² a Gs. 0 y de dónde salió', async () => {
      for (const [ot, piezas, desp] of [[ots[0], '2,871', '0,2339'], [ots[1], '3,1556', '0,257'], [ots[2], '2,727', '0,2222']]) {
        await pj.goto(`${B}/ots/${ot.id}`);
        await pj.getByText(piezas, { exact: false }).first().waitFor();
        await pj.getByText(desp, { exact: false }).first().waitFor();
      }
      await pj.goto(`${B}/ots/${ots[3].id}`);
      await pj.getByText('0,965', { exact: false }).first().waitFor();
      await pj.getByText(`aprovecha el desperdicio de ${ots[1].codigo_ot}`, { exact: false }).first().waitFor();
      const [{ total, gs }] = await sql`SELECT sum(cantidad)::float8 AS total, sum(cantidad * costo_unitario_gs)::float8 AS gs
                                        FROM consumo_insumo WHERE orden_trabajo_id IN (${ots[0].id}, ${ots[1].id}, ${ots[2].id})`;
      if (Math.abs(total - 9.4667) > 1e-9 || Math.abs(gs - 9.4667 * 63000) > 1e-6) throw new Error(`Σ = ${total} m², ${gs} Gs`);
    });
    if (errores.length) throw new Error(errores.join(' | '));
    console.log(`\n>>> RECORRIDO MEDIDAS EN CM (CA-18.6 + L18.E2) EN VERDE: ${n}/${n} PASOS OK <<<\n`);
  } finally {
    await browser.close();
    for (const id of personas) await sql`UPDATE persona SET activo = false WHERE id = ${id}`;
    await sql`UPDATE usuario SET activo = false WHERE username IN (${edu}, ${jefe})`;
    await sql`UPDATE insumo SET activo = false WHERE nombre = ${material}`;
    await sql.end({ timeout: 3 });
  }
})().catch(() => process.exit(1));
