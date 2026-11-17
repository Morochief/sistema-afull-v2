/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console, process */
/**
 * Recorrido CA-19.7 (Loop 19): Nachi (celular) carga su diseño tildando "Ya lo verifiqué" → Edu lo ve enseguida
 * en Diseños / Para producir → Edu encuentra un error → Nachi sube la versión corregida (con el motivo) y la marca
 * como verificada → Edu ve la v2.
 * Uso: node scripts/prueba-nachi.cjs   (BASE_URL y CHROMIUM_PATH opcionales)
 */
const { chromium } = require('playwright');
const postgres = require('postgres');
const { config } = require('dotenv');

config({ path: ['.env', '.env.test'] });
const B = process.env.BASE_URL || 'http://localhost:5173';
const DRIVE = (n) => `https://drive.google.com/file/d/zz_test_nachi_${n}/view`;

(async () => {
  const sql = postgres(process.env.DATABASE_URL_ADMIN, { max: 1, prepare: false });
  const { hashearPassword } = await import('../apps/api/dist/modules/auth/password.js');
  const s = Math.random().toString(36).slice(2, 7);
  const nachi = `zz_test_nachi19_${s}`;
  const edu = `zz_test_edu19_${s}`;
  const opciones = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : process.platform === 'win32' ? { channel: 'chrome' } : {};
  const browser = await chromium.launch(opciones);
  const pn = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
  const pe = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
  const errores = [];
  for (const p of [pn, pe]) { p.setDefaultTimeout(12000); p.on('pageerror', (e) => errores.push(e.message)); }
  let n = 0;
  let personaId;
  let ot;
  const paso = async (t, fn) => {
    n += 1;
    try { await fn(); console.log('OK  ', n, t); } catch (e) {
      console.log('FALLA', n, t, '->', e.message.split('\n')[0]);
      await pn.screenshot({ path: `prueba-nachi-falla-${n}-nachi.png` });
      await pe.screenshot({ path: `prueba-nachi-falla-${n}-edu.png` });
      throw e;
    }
  };
  const login = async (page, user) => {
    await page.goto(B + '/login');
    await page.getByPlaceholder('Nombre de usuario').fill(user);
    await page.locator('input[type=password]').fill('Password123!');
    await page.getByRole('button', { name: /Iniciar sesión/ }).click();
    await page.waitForURL(/\/mi-trabajo/);
  };
  const cola = async () => {
    await pe.goto(B + '/disenos');
    await pe.getByRole('heading', { name: /Para producir/ }).waitFor();
    await pe.waitForLoadState('networkidle'); // el título aparece antes de que llegue la lista
    return pe.getByText(ot.codigo_ot).count();
  };
  try {
    await paso('fixture: Nachi con una tarea de diseño (hoja activa) y Edu del taller', async () => {
      const hash = await hashearPassword('Password123!');
      const [un] = await sql`INSERT INTO usuario (username, password_hash) VALUES (${nachi}, ${hash}) RETURNING id`;
      await sql`INSERT INTO permiso_capacidad (usuario_id, capacidad) VALUES (${un.id}, 'diseno')`;
      const [ue] = await sql`INSERT INTO usuario (username, password_hash) VALUES (${edu}, ${hash}) RETURNING id`;
      await sql`INSERT INTO permiso_capacidad (usuario_id, capacidad) VALUES (${ue.id}, 'taller')`;
      const [p] = await sql`INSERT INTO persona (nombre, ci) VALUES (${'zz_test_Nachi ' + s}, ${'N19' + s}) RETURNING id`;
      personaId = p.id;
      await sql`UPDATE usuario SET persona_id = ${p.id} WHERE id = ${un.id}`;
      const [c] = await sql`INSERT INTO cliente (codigo, nombre) VALUES (${'C19-' + s}, ${'zz_test cli ' + s}) RETURNING id`;
      [ot] = await sql`INSERT INTO orden_trabajo (codigo_ot, cliente_id, titulo, creado_por) VALUES (${'OT19-' + s}, ${c.id}, ${'zz_test cartel ' + s}, ${un.id}) RETURNING id, codigo_ot`;
      await sql`INSERT INTO tarea (orden_trabajo_id, persona_asignada_id, tipo, descripcion, orden_secuencia, estado, creado_por)
                VALUES (${ot.id}, ${p.id}, 'DISENO', ${'zz_test diseñar cartel ' + s}, 1, 'PENDIENTE', ${un.id})`;
      await login(pn, nachi);
      await login(pe, edu);
    });
    await paso('Edu todavía no ve la OT para producir', async () => {
      if (await cola()) throw new Error('Edu ve la OT antes de que haya diseño');
    });
    await paso('Nachi carga el enlace tildando "Ya lo verifiqué"', async () => {
      await pn.getByRole('button', { name: /Cargar enlace del diseño/ }).click();
      await pn.getByLabel(/Enlace de Google Drive/).fill(DRIVE(1));
      await pn.getByLabel(/Ya lo verifiqué/).check();
      await pn.getByRole('button', { name: 'Cargar diseño' }).click();
      await pn.getByText('Diseño v1 verificado: Edu ya lo ve en Diseños.').waitFor();
      await pn.getByText('v1 · Verificado por vos').waitFor();
    });
    await paso('Edu la ve enseguida en Para producir', async () => {
      if (!(await cola())) throw new Error('Edu no ve la OT');
    });
    await paso('Edu avisa un error: Nachi sube la v2 con el motivo (sin verificar) → Edu deja de verla', async () => {
      await pn.getByRole('button', { name: /Subir versión corregida/ }).click();
      await pn.getByLabel(/Enlace de Google Drive/).fill(DRIVE(2));
      await pn.getByLabel(/Qué cambió/).fill('Edu vio un error en el teléfono');
      await pn.getByRole('button', { name: 'Cargar diseño' }).click();
      await pn.getByText('v2 · Por verificar').waitFor();
      if (await cola()) throw new Error('Edu sigue viendo la v1 como lista');
    });
    await paso('Nachi marca la v2 como verificada → Edu ve la v2', async () => {
      await pn.getByRole('button', { name: /Marcar como verificado/ }).click();
      await pn.getByText('v2 · Verificado por vos').waitFor();
      if (!(await cola())) throw new Error('Edu no ve la v2');
      await pe.getByText('v2').first().waitFor();
      const v = await sql`SELECT version, estado, autoverificada, motivo_cambio FROM diseno_version WHERE orden_trabajo_id = ${ot.id} ORDER BY version`;
      if (v.length !== 2 || v[1].estado !== 'APROBADO' || !v[1].autoverificada || v[1].motivo_cambio !== 'Edu vio un error en el teléfono') throw new Error(JSON.stringify(v));
    });
    if (errores.length) throw new Error(errores.join(' | '));
    console.log(`\n>>> RECORRIDO NACHI VERIFICA (CA-19.7) EN VERDE: ${n}/${n} PASOS OK <<<\n`);
  } finally {
    await browser.close();
    if (personaId) await sql`UPDATE persona SET activo = false WHERE id = ${personaId}`;
    await sql`UPDATE usuario SET activo = false WHERE username IN (${nachi}, ${edu})`;
    await sql.end({ timeout: 3 });
  }
})().catch(() => process.exit(1));
