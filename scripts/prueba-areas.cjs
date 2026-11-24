/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console, process */
/**
 * Recorrido CA-22.7 (Loop 22): Juan marca "Despiece de materiales" (Carpintería) con medidas en cm → Edu ve
 * "Medidas (cm)" en esa tarea → Reportes → Horas por área muestra la OT con 1 h de Carpintería y 0,5 h de Pintura.
 * Uso: node scripts/prueba-areas.cjs   (BASE_URL y CHROMIUM_PATH opcionales)
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
  const usuarios = [`zz_test_juan22_${s}`, `zz_test_edu22_${s}`];
  const opciones = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : process.platform === 'win32' ? { channel: 'chrome' } : {};
  const browser = await chromium.launch(opciones);
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'America/Asuncion' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  let n = 0;
  let medidasAntes = null;
  let personaId;
  let clienteId;
  const codigoOt = `OT-Z22-${s}`;
  const paso = async (t, fn) => {
    n += 1;
    try { await fn(); console.log('OK  ', n, t); } catch (e) {
      console.log('FALLA', n, t, '->', e.message.split('\n')[0]);
      await page.screenshot({ path: `prueba-areas-falla-${n}.png` });
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
    await paso('fixture: Juan (admin), Edu (taller) con una OT de Despiece y horas de Lijado y Pintura en septiembre', async () => {
      [{ con_medidas: medidasAntes }] = await sql`SELECT con_medidas FROM tipo_tarea WHERE codigo = 'DESPIECE_DE_MATERIALES'`;
      await sql`UPDATE tipo_tarea SET con_medidas = false WHERE codigo = 'DESPIECE_DE_MATERIALES'`;
      const hash = await hashearPassword('Password123!');
      const ids = [];
      for (const [u, cap] of [[usuarios[0], 'admin'], [usuarios[1], 'taller']]) {
        const [x] = await sql`INSERT INTO usuario (username, password_hash) VALUES (${u}, ${hash}) RETURNING id`;
        await sql`INSERT INTO permiso_capacidad (usuario_id, capacidad) VALUES (${x.id}, ${cap})`;
        ids.push(x.id);
      }
      const [p] = await sql`INSERT INTO persona (nombre, ci) VALUES (${'zz_test_Edu22 ' + s}, ${'P22' + s}) RETURNING id`;
      personaId = p.id;
      await sql`UPDATE usuario SET persona_id = ${p.id} WHERE id = ${ids[1]}`;
      const [c] = await sql`INSERT INTO cliente (codigo, nombre) VALUES (${'C22-' + s}, ${'zz_test_cli22_' + s}) RETURNING id`;
      clienteId = c.id;
      const [o] = await sql`INSERT INTO orden_trabajo (codigo_ot, cliente_id, titulo, creado_por) VALUES (${codigoOt}, ${c.id}, 'zz_test mueble', ${ids[0]}) RETURNING id`;
      const tarea = async (tipo, estado) => (await sql`
        INSERT INTO tarea (orden_trabajo_id, persona_asignada_id, tipo, descripcion, orden_secuencia, estado, creado_por)
        VALUES (${o.id}, ${p.id}, ${tipo}, ${'zz_test ' + tipo}, 1, ${estado}, ${ids[0]}) RETURNING id`)[0].id;
      await tarea('DESPIECE_DE_MATERIALES', 'PENDIENTE');
      const tramo = async (tipo, ini, fin) => sql`
        INSERT INTO tarea_intervalo (tarea_id, persona_id, hora_inicio, hora_fin, motivo_cierre, clave_idempotencia)
        VALUES (${await tarea(tipo, 'LISTO')}, ${p.id}, ${ini}, ${fin}, 'FIN', ${crypto.randomUUID()})`;
      await tramo('LIJADO', '2026-09-16T08:00:00-03:00', '2026-09-16T09:00:00-03:00');
      await tramo('PINTURA', '2026-09-16T09:00:00-03:00', '2026-09-16T09:30:00-03:00');
    });
    await paso('Edu todavía no tiene "Medidas (cm)" en el Despiece', async () => {
      await entrar(usuarios[1], '/mi-trabajo');
      await page.getByText('zz_test DESPIECE_DE_MATERIALES').waitFor();
      if (await page.getByRole('button', { name: /Medidas \(cm\)/ }).count()) throw new Error('ya tenía medidas');
    });
    await paso('Juan ve los procesos por área y marca "Despiece de materiales" de Carpintería con medidas en cm', async () => {
      await entrar(usuarios[0], '/procesos');
      const carp = page.getByRole('region', { name: 'Carpintería' });
      await carp.getByText('Corte MDF').waitFor();
      await page.getByRole('region', { name: 'Pintura' }).getByText('Colocación de enduido y lijado').waitFor();
      const fila = carp.locator('div', { hasText: 'Despiece de materiales' }).last();
      await fila.getByRole('button', { name: 'Sin medidas' }).click();
      await page.getByText('Despiece de materiales: con medidas en cm.').waitFor();
    });
    await paso('Edu ahora ve "Medidas (cm)" en esa tarea', async () => {
      await entrar(usuarios[1], '/mi-trabajo');
      await page.getByText('zz_test DESPIECE_DE_MATERIALES').waitFor();
      await page.getByRole('button', { name: /Medidas \(cm\)/ }).first().waitFor();
    });
    await paso('Reportes → Horas por área: la OT con 1 h de Carpintería y 0,5 h de Pintura', async () => {
      await entrar(usuarios[0], '/reportes');
      await page.getByRole('tab', { name: 'Horas por área' }).click();
      await page.locator('#areaDesde').fill('2026-09-16');
      await page.locator('#areaHasta').fill('2026-09-16');
      const fila = page.getByRole('row', { name: new RegExp(codigoOt) });
      await fila.waitFor();
      const celdas = await fila.getByRole('cell').allTextContents();
      if (!celdas.includes('01:00') || !celdas.includes('00:30') || !celdas.includes('01:30')) throw new Error('horas: ' + celdas.join(' | '));
    });
    await paso('la OT muestra el costo por área', async () => {
      const [o] = await sql`SELECT id FROM orden_trabajo WHERE codigo_ot = ${codigoOt}`;
      await page.goto(`${B}/ots/${o.id}`);
      const areas = page.getByLabel('Horas por área');
      await areas.getByText('Carpintería').waitFor();
      await areas.getByText('Pintura').waitFor();
    });
    if (errores.length) throw new Error(errores.join(' | '));
    console.log(`\n>>> RECORRIDO ÁREAS DE TRABAJO (CA-22.7) EN VERDE: ${n}/${n} PASOS OK <<<\n`);
  } finally {
    await browser.close();
    if (medidasAntes !== null) await sql`UPDATE tipo_tarea SET con_medidas = ${medidasAntes} WHERE codigo = 'DESPIECE_DE_MATERIALES'`;
    if (personaId) await sql`UPDATE persona SET activo = false WHERE id = ${personaId}`;
    if (clienteId) await sql`UPDATE cliente SET activo = false WHERE id = ${clienteId}`;
    for (const u of usuarios) await sql`UPDATE usuario SET activo = false WHERE username = ${u}`;
    await sql.end({ timeout: 3 });
  }
})().catch(() => process.exit(1));
