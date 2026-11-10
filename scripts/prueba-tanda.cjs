/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console, process */
/**
 * Recorrido CA-12.7 (Loop 12, horas de máquina compartidas): Edu (celular 375 px) tiene dos impresiones de clientes
 * distintos; arma una tanda desde la tarjeta (m² propuestos de cada tarea), ve una sola tarjeta con las dos OTs,
 * trabaja, pausa, reanuda y finaliza. Las dos tareas quedan LISTO y el tiempo queda repartido 2 : 1,5 entre las OTs.
 * Uso: node scripts/prueba-tanda.cjs   (BASE_URL y CHROMIUM_PATH opcionales)
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
  const edu = `zz_test_edut_${s}`;
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
      await page.screenshot({ path: `prueba-tanda-falla-${n}.png` });
      throw e;
    }
  };
  try {
    await paso('fixture: Edu con dos impresiones (2 m² y 1,5 m²) de clientes distintos', async () => {
      const [u] = await sql`INSERT INTO usuario (username, password_hash) VALUES (${edu}, ${await hashearPassword('Password123!')}) RETURNING id`;
      await sql`INSERT INTO permiso_capacidad (usuario_id, capacidad) VALUES (${u.id}, 'taller')`;
      const [p] = await sql`INSERT INTO persona (nombre, ci) VALUES (${'zz_test_Edu ' + s}, ${'T12' + s}) RETURNING id`;
      personaId = p.id;
      await sql`UPDATE usuario SET persona_id = ${p.id} WHERE id = ${u.id}`;
      for (const [k, cli, m2] of [['A', 'Farmacia', 2], ['B', 'Super', 1.5]]) {
        const [c] = await sql`INSERT INTO cliente (codigo, nombre) VALUES (${`C12${k}-` + s}, ${`zz_test ${cli} ${s}`}) RETURNING id`;
        const [ot] = await sql`INSERT INTO orden_trabajo (codigo_ot, cliente_id, titulo, creado_por) VALUES (${`OT12${k}-` + s}, ${c.id}, ${'zz_test lona ' + k}, ${u.id}) RETURNING id, codigo_ot`;
        const [t] = await sql`INSERT INTO tarea (orden_trabajo_id, persona_asignada_id, tipo, descripcion, orden_secuencia, estado, creado_por, cantidad, unidad)
                  VALUES (${ot.id}, ${p.id}, 'TALLER_IMPRESION', ${'zz_test imprimir ' + k}, 1, 'PENDIENTE', ${u.id}, ${m2}, 'm2') RETURNING id`;
        ots.push({ ...ot, cli, tareaId: t.id });
      }
      await page.goto(B + '/login');
      await page.getByPlaceholder('Nombre de usuario').fill(edu);
      await page.locator('input[type=password]').fill('Password123!');
      await page.getByRole('button', { name: /Iniciar sesión/ }).click();
      await page.waitForURL(/\/mi-trabajo/);
    });
    await paso('arma la tanda desde la tarjeta de la OT A: propone 2 y 1,5 m²', async () => {
      const tarjeta = page.locator('div.rounded-md', { hasText: `${ots[0].codigo_ot} · zz_test Farmacia` }).filter({ has: page.getByRole('button', { name: /Iniciar Trabajo/ }) }).last();
      await tarjeta.getByRole('button', { name: /Tanda para varios clientes/ }).click();
      const dlg = page.getByRole('dialog');
      if ((await dlg.getByLabel(`m² ${ots[0].codigo_ot}`).inputValue()) !== '2') throw new Error('no propuso 2 m²');
      if ((await dlg.getByLabel(`m² ${ots[1].codigo_ot}`).inputValue()) !== '1,5') throw new Error('no propuso 1,5 m²');
      await dlg.getByRole('button', { name: 'Iniciar tanda' }).click();
      await page.getByText('Tanda compartida').waitFor();
    });
    await paso('una sola tarjeta en curso que nombra las dos OTs', async () => {
      await page.getByText('EN CURSO').waitFor();
      await page.getByText(`${ots[0].codigo_ot} · zz_test Farmacia ${s} (2 m²)`).waitFor();
      await page.getByText(`${ots[1].codigo_ot} · zz_test Super ${s} (1,5 m²)`).waitFor();
      if (await page.getByRole('button', { name: /Iniciar Trabajo|Reanudar Trabajo/ }).count()) throw new Error('quedó otra tarjeta suelta');
      await page.waitForTimeout(2500);
    });
    await paso('pausa y reanuda la tanda', async () => {
      await page.getByRole('button', { name: /Pausar/ }).click();
      await page.getByText('Pausa breve').click();
      await page.getByRole('button', { name: 'Confirmar Pausa' }).click();
      await page.getByRole('button', { name: /Reanudar Trabajo/ }).click();
      await page.getByText('EN CURSO').waitFor();
      await page.waitForTimeout(1500);
    });
    await paso('finaliza: las dos tareas quedan LISTO', async () => {
      await page.getByRole('button', { name: /Finalizar/ }).click();
      await page.getByRole('button', { name: 'Marcar como Listo' }).click();
      await page.getByText('Tanda compartida').waitFor({ state: 'detached' });
      const est = await sql`SELECT estado FROM tarea WHERE id IN (${ots[0].tareaId}, ${ots[1].tareaId})`;
      if (est.length !== 2 || est.some((r) => r.estado !== 'LISTO')) throw new Error(JSON.stringify(est));
    });
    await paso('el tiempo quedó repartido 2 : 1,5 entre las dos OTs', async () => {
      const r = await sql`SELECT orden_trabajo_id, sum(segundos * peso / peso_total)::float8 AS seg FROM v_mano_obra
                          WHERE orden_trabajo_id IN (${ots[0].id}, ${ots[1].id}) GROUP BY 1`;
      const a = r.find((x) => x.orden_trabajo_id === ots[0].id)?.seg ?? 0;
      const b = r.find((x) => x.orden_trabajo_id === ots[1].id)?.seg ?? 0;
      if (!(a > 1 && b > 1) || Math.abs(a / b - 2 / 1.5) > 1e-6) throw new Error(`A=${a} s, B=${b} s`);
    });
    if (errores.length) throw new Error(errores.join(' | '));
    console.log(`\n>>> RECORRIDO TANDA COMPARTIDA (CA-12.7) EN VERDE: ${n}/${n} PASOS OK <<<\n`);
  } finally {
    await browser.close();
    if (personaId) {
      await sql`UPDATE tarea_intervalo SET hora_fin = greatest(clock_timestamp(), hora_inicio), motivo_cierre = 'FIN' WHERE hora_fin IS NULL AND persona_id = ${personaId}`;
      await sql`UPDATE persona SET activo = false WHERE id = ${personaId}`;
    }
    await sql`UPDATE usuario SET activo = false WHERE username = ${edu}`;
    await sql.end({ timeout: 3 });
  }
})().catch(() => process.exit(1));
