/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console, process */
/**
 * Recorrido CA-20.8 (Loop 20): Juan (compu) en Reportes: filtra octubre y un cliente, ve los registros como el Excel
 * (1 h de Edu, lona, desperdicio y viaje: Gs. 144.000), descarga el Excel y suma lo mismo; en Horas para pagar ve a Edu;
 * arma la pre-factura del proyecto con 30 % (precio 205.714) e imprime la hoja A4.
 * Uso: node scripts/prueba-reportes.cjs   (BASE_URL y CHROMIUM_PATH opcionales)
 */
const { chromium } = require('playwright');
const postgres = require('postgres');
const ExcelJS = require('exceljs');
const { config } = require('dotenv');
const { randomUUID } = require('node:crypto');

config({ path: ['.env', '.env.test'] });
const B = process.env.BASE_URL || 'http://localhost:5173';
const uuid = () => randomUUID();

(async () => {
  const sql = postgres(process.env.DATABASE_URL_ADMIN, { max: 1, prepare: false });
  const { hashearPassword } = await import('../apps/api/dist/modules/auth/password.js');
  const s = Math.random().toString(36).slice(2, 7);
  const juan = `zz_test_juan20_${s}`;
  const cliNombre = `zz_test Marilan ${s}`;
  const opciones = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : process.platform === 'win32' ? { channel: 'chrome' } : {};
  const browser = await chromium.launch(opciones);
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true, timezoneId: 'America/Asuncion' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  let n = 0;
  const personas = [];
  let proyectoNombre;
  const paso = async (t, fn) => {
    n += 1;
    try { await fn(); console.log('OK  ', n, t); } catch (e) {
      console.log('FALLA', n, t, '->', e.message.split('\n')[0]);
      await page.screenshot({ path: `prueba-reportes-falla-${n}.png` });
      throw e;
    }
  };
  const fechas = async (desde, hasta) => {
    await page.getByLabel('Desde').fill(desde);
    await page.getByLabel('Hasta').fill(hasta);
  };
  try {
    await paso('fixture: proyecto con 2 OTs, 1 h de Edu, lona + desperdicio y un viaje (octubre)', async () => {
      const [u] = await sql`INSERT INTO usuario (username, password_hash) VALUES (${juan}, ${await hashearPassword('Password123!')}) RETURNING id`;
      await sql`INSERT INTO permiso_capacidad (usuario_id, capacidad) VALUES (${u.id}, 'admin')`;
      const [pE] = await sql`INSERT INTO persona (nombre, ci) VALUES (${'zz_test_Edu20 ' + s}, ${'R20' + s}) RETURNING id`;
      personas.push(pE.id);
      await sql`INSERT INTO tarifa_persona (persona_id, tarifa_hora_gs, fecha_inicio) VALUES (${pE.id}, 21000, '2026-01-01')`;
      const [c] = await sql`INSERT INTO cliente (codigo, nombre, razon_social, ruc) VALUES (${'C20-' + s}, ${cliNombre}, 'zz_test Marilan SA', ${'80' + s + '-1'}) RETURNING id`;
      proyectoNombre = `zz_test casetas ${s}`;
      const [py] = await sql`INSERT INTO proyecto (codigo, cliente_id, nombre, creado_por) VALUES (${'PRY-Z20-' + s}, ${c.id}, ${proyectoNombre}, ${u.id}) RETURNING id`;
      const ot = async (k, monto) => (await sql`INSERT INTO orden_trabajo (codigo_ot, cliente_id, titulo, creado_por, proyecto_id, monto_presupuestado_gs)
        VALUES (${`OT-Z20${k}-${s}`}, ${c.id}, ${'zz_test caseta ' + k}, ${u.id}, ${py.id}, ${monto}) RETURNING id`)[0].id;
      const ot1 = await ot('A', 200000);
      const ot2 = await ot('B', null);
      const [t] = await sql`INSERT INTO tarea (orden_trabajo_id, persona_asignada_id, tipo, descripcion, orden_secuencia, creado_por)
                            VALUES (${ot1}, ${pE.id}, 'TALLER_IMPRESION', 'Imprimir lona', 1, ${u.id}) RETURNING id`;
      await sql`INSERT INTO tarea_intervalo (tarea_id, persona_id, hora_inicio, hora_fin, motivo_cierre, clave_idempotencia)
                VALUES (${t.id}, ${pE.id}, '2026-10-10T08:00:00-03:00', '2026-10-10T09:00:00-03:00', 'FIN', ${uuid()})`;
      const [i] = await sql`INSERT INTO insumo (nombre, unidad) VALUES (${'zz_test Lona ' + s}, 'M2') RETURNING id`;
      for (const [cant, desp] of [[3, false], [0.5, true]]) {
        await sql`INSERT INTO consumo_insumo (orden_trabajo_id, insumo_id, persona_id, cargado_por, cantidad, costo_unitario_gs, es_desperdicio, clave_idempotencia, created_at)
                  VALUES (${ot1}, ${i.id}, ${pE.id}, ${u.id}, ${cant}, 18000, ${desp}, ${uuid()}, '2026-10-10T10:00:00-03:00')`;
      }
      const [v] = await sql`INSERT INTO vehiculo (chapa, marca_modelo, costo_km_gs) VALUES (${'Z20' + s.toUpperCase()}, 'zz_test Hilux', 2000) RETURNING id`;
      const [h] = await sql`INSERT INTO hoja_ruta (fecha, vehiculo_id, creado_por) VALUES ('2026-10-12', ${v.id}, ${u.id}) RETURNING id`;
      await sql`INSERT INTO hoja_ruta_parada (hoja_ruta_id, orden_trabajo_id, orden_secuencia, estado) VALUES (${h.id}, ${ot1}, 1, 'COMPLETADA'), (${h.id}, ${ot2}, 2, 'COMPLETADA')`;
      await sql`INSERT INTO viaje (vehiculo_id, conductor_persona_id, hoja_ruta_id, km_inicio, km_fin, hora_inicio, hora_fin, clave_idempotencia)
                VALUES (${v.id}, ${pE.id}, ${h.id}, 1000, 1030, '2026-10-12T08:00:00-03:00', '2026-10-12T12:00:00-03:00', ${uuid()})`;
      await page.goto(B + '/login');
      await page.getByPlaceholder('Nombre de usuario').fill(juan);
      await page.locator('input[type=password]').fill('Password123!');
      await page.getByRole('button', { name: /Iniciar sesión/ }).click();
      await page.waitForURL(/\/inicio/);
    });
    await paso('Reportes → Registros: octubre + cliente: 5 registros y total Gs. 144.000', async () => {
      await page.getByRole('link', { name: 'Reportes' }).first().click();
      await page.getByRole('heading', { name: 'Reportes' }).waitFor();
      await fechas('2026-10-01', '2026-10-31');
      await page.getByLabel('Cliente').fill(cliNombre);
      await page.getByRole('button', { name: cliNombre }).click();
      await page.getByText(`zz_test_Edu20 ${s} · Imprimir lona`).waitFor();
      await page.getByTestId('totales-registros').getByText('Gs. 144.000').waitFor();
    });
    await paso('Descargar Excel: hoja Registros con las columnas de Juan y la misma suma', async () => {
      const [descarga] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: /Descargar Excel/ }).click()]);
      const ruta = await descarga.path();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(ruta);
      const filas = wb.getWorksheet('Registros').getSheetValues().slice(2).filter(Boolean);
      const total = filas.reduce((a, f) => a + f[13], 0);
      if (filas.length !== 5 || total !== 144000) throw new Error(`${filas.length} filas, total ${total}`);
    });
    await paso('Horas para pagar: Edu 01:00 y Gs. 21.000', async () => {
      await page.getByRole('tab', { name: 'Horas para pagar' }).click();
      await fechas('2026-10-01', '2026-10-31');
      const fila = page.locator('tr', { hasText: `zz_test_Edu20 ${s}` });
      await fila.getByText('01:00').waitFor();
      await fila.getByText('Gs. 21.000').waitFor();
    });
    await paso('Pre-factura del proyecto: costo 144.000, 30 % → 205.714 + IVA = 226.285, y presupuestado 200.000', async () => {
      await page.getByRole('tab', { name: 'Pre-factura' }).click();
      await page.getByLabel('Proyecto', { exact: true }).fill(proyectoNombre);
      await page.getByRole('button', { name: new RegExp(proyectoNombre) }).click();
      await page.getByTestId('precio-sugerido').filter({ hasText: '205.714' }).waitFor();
      await page.getByTestId('total-con-iva').filter({ hasText: '226.285' }).waitFor();
      await page.getByText('Presupuestado (sin IVA)').waitFor();
    });
    await paso('Imprimir: hoja A4 con el cliente, el RUC y el detalle de 5 registros', async () => {
      await page.getByLabel('Solicitante (opcional)').fill('Compras, María');
      const [hoja] = await Promise.all([ctx.waitForEvent('page'), page.getByRole('button', { name: /Imprimir \/ Guardar PDF/ }).click()]);
      await hoja.getByText('Pre-factura (documento interno, no válido como factura)').waitFor();
      await hoja.getByText('Solicitante: Compras, María').waitFor();
      await hoja.getByText(`RUC 80${s}-1`, { exact: false }).waitFor();
      await hoja.getByText('Detalle (5 registros)').waitFor();
      await hoja.getByTestId('precio-sugerido').filter({ hasText: '205.714' }).waitFor();
    });
    if (errores.length) throw new Error(errores.join(' | '));
    console.log(`\n>>> RECORRIDO REPORTES (CA-20.8) EN VERDE: ${n}/${n} PASOS OK <<<\n`);
  } finally {
    await browser.close();
    for (const id of personas) await sql`UPDATE persona SET activo = false WHERE id = ${id}`;
    await sql`UPDATE usuario SET activo = false WHERE username = ${juan}`;
    await sql.end({ timeout: 3 });
  }
})().catch(() => process.exit(1));
