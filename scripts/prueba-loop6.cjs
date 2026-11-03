/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console, process, crypto */
/**
 * Recorrido del Loop 6 en navegador: OT de un proyecto con horas (con y sin tarifa), material y un viaje compartido
 * → Sofi ve el costo a la fecha (Gs 200.000, margen 60 %) → la termina y queda congelado → aparece en Rentabilidad
 * → el proyecto muestra el consolidado → Edu (taller) no ve el menú ni puede entrar a Rentabilidad.
 *
 * Uso: node scripts/prueba-loop6.cjs   (BASE_URL y CHROMIUM_PATH opcionales)
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
      await page.screenshot({ path: `prueba-loop6-falla-${n}.png` });
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

  const ids = { personas: [], clientes: [], vehiculos: [] };
  try {
    let ot1, ot2, proyecto;
    await paso('fixtures: Sofi, Edu (tarifa 20.000/h), proyecto con 2 OTs, horas, material y un viaje de 30 km', async () => {
      const sofi = await usuario(`zz_test_sofi6_${s}`, 'comercial');
      const [pE] = await sql`INSERT INTO persona (nombre, ci) VALUES (${'zz_test_Edu6 ' + s}, ${'C6E' + s}) RETURNING id`;
      const [pN] = await sql`INSERT INTO persona (nombre, ci) VALUES (${'zz_test_Nachi6 ' + s}, ${'C6N' + s}) RETURNING id`;
      ids.personas.push(pE.id, pN.id);
      await usuario(`zz_test_edu6_${s}`, 'taller', pE.id);
      await sql`INSERT INTO tarifa_persona (persona_id, tarifa_hora_gs, fecha_inicio) VALUES (${pE.id}, 20000, '2026-01-01')`;
      const [c] = await sql`INSERT INTO cliente (codigo, nombre) VALUES (${'Z6' + s}, ${'zz_test_cli6 ' + s}) RETURNING id`;
      ids.clientes.push(c.id);
      const [py] = await sql`INSERT INTO proyecto (codigo, cliente_id, nombre, creado_por) VALUES (${'PRY-Z6-' + s}, ${c.id}, ${'zz_test Proyecto ' + s}, ${sofi}) RETURNING id`;
      proyecto = py.id;
      const nuevaOT = async (suf, monto) => {
        const [o] = await sql`INSERT INTO orden_trabajo (codigo_ot, cliente_id, titulo, creado_por, proyecto_id, monto_presupuestado_gs)
          VALUES (${`OT-Z6${suf}-${s}`}, ${c.id}, ${'zz_test Fachada ' + suf + ' ' + s}, ${sofi}, ${py.id}, ${monto}) RETURNING id`;
        await sql`INSERT INTO ot_evento (orden_trabajo_id, estado_nuevo, autor_id) VALUES (${o.id}, 'PENDIENTE', ${sofi})`;
        return o.id;
      };
      ot1 = await nuevaOT('A', 500000);
      ot2 = await nuevaOT('B', 300000);
      const tarea = async (p, tipo) => (await sql`INSERT INTO tarea (orden_trabajo_id, persona_asignada_id, tipo, descripcion, orden_secuencia, creado_por)
        VALUES (${ot1}, ${p}, ${tipo}, 'zz_test', 1, ${sofi}) RETURNING id`)[0].id;
      const tE = await tarea(pE.id, 'TALLER_IMPRESION');
      const tN = await tarea(pN.id, 'DISENO');
      const intervalo = (t, p, a, b) => sql`INSERT INTO tarea_intervalo (tarea_id, persona_id, hora_inicio, hora_fin, motivo_cierre, clave_idempotencia)
        VALUES (${t}, ${p}, ${a}, ${b}, 'FIN', ${crypto.randomUUID()})`;
      await intervalo(tE, pE.id, '2026-10-10T10:00:00-03:00', '2026-10-10T12:00:00-03:00');
      await intervalo(tN, pN.id, '2026-10-10T09:00:00-03:00', '2026-10-10T10:00:00-03:00');
      const [ins] = await sql`INSERT INTO insumo (nombre, unidad) VALUES (${'zz_test Lona6 ' + s}, 'M2') RETURNING id`;
      await sql`INSERT INTO insumo_precio (insumo_id, costo_unitario_gs) VALUES (${ins.id}, 35000)`;
      await sql`INSERT INTO consumo_insumo (orden_trabajo_id, insumo_id, cargado_por, cantidad, costo_unitario_gs, clave_idempotencia)
        VALUES (${ot1}, ${ins.id}, ${sofi}, 3.5, 35000, ${crypto.randomUUID()})`;
      const [v] = await sql`INSERT INTO vehiculo (chapa, marca_modelo, costo_km_gs) VALUES (${'Z6' + s.toUpperCase()}, 'zz_test Hilux', 2500) RETURNING id`;
      ids.vehiculos.push(v.id);
      const [h] = await sql`INSERT INTO hoja_ruta (fecha, vehiculo_id, creado_por) VALUES ('2026-10-12', ${v.id}, ${sofi}) RETURNING id`;
      await sql`INSERT INTO hoja_ruta_parada (hoja_ruta_id, orden_trabajo_id, orden_secuencia, estado) VALUES (${h.id}, ${ot1}, 1, 'COMPLETADA'), (${h.id}, ${ot2}, 2, 'COMPLETADA')`;
      await sql`INSERT INTO viaje (vehiculo_id, conductor_persona_id, hoja_ruta_id, km_inicio, km_fin, hora_inicio, hora_fin, clave_idempotencia)
        VALUES (${v.id}, ${pE.id}, ${h.id}, 1000, 1030, '2026-10-12T08:00:00-03:00', '2026-10-12T12:00:00-03:00', ${crypto.randomUUID()})`;
    });

    await paso('Sofi abre la OT: costo a la fecha Gs 200.000 (40.000 + 122.500 + 37.500), margen 60 % y aviso de horas sin tarifa', async () => {
      await entrar(`zz_test_sofi6_${s}`);
      await page.goto(B + `/ots/${ot1}`);
      const sec = page.getByTestId('seccion-costeo');
      await sec.getByText(/A la fecha/).waitFor();
      const total = await page.getByTestId('costo-total').textContent();
      if (!/200\.000/.test(total)) throw new Error('Costo inesperado: ' + total);
      if (!/60 %/.test(await page.getByTestId('margen-real').textContent())) throw new Error('Margen inesperado');
      await sec.getByText(/Horas sin tarifa vigente/).waitFor();
      await sec.getByText(/30 km ÷ 2 OTs = 15 km/).waitFor();
    });

    await paso('Sofi termina la OT y el costo queda congelado', async () => {
      for (const destino of ['EN_TALLER', 'TERMINADO']) {
        await page.getByRole('button', { name: /Avanzar Estado/ }).click();
        await page.getByTestId(`estado-opcion-${destino}`).click();
        await page.getByRole('button', { name: /Confirmar Transición/ }).click();
        await page.getByRole('dialog').waitFor({ state: 'detached' });
      }
      await page.getByTestId('seccion-costeo').getByText(/Congelado al cerrar/).waitFor();
      const [{ n }] = await sql`SELECT count(*)::int AS n FROM ot_costeo WHERE orden_trabajo_id = ${ot1} AND total_gs = 200000`;
      if (n !== 1) throw new Error('No se guardó el snapshot');
    });

    await paso('Rentabilidad lista la OT con su margen; el proyecto muestra el consolidado (Gs 237.500, 70,31 %)', async () => {
      await page.getByRole('link', { name: 'Rentabilidad' }).click();
      await page.waitForURL(/\/rentabilidad/);
      await page.getByPlaceholder(/Buscar por OT/).fill('OT-Z6A-' + s);
      await page.getByText('OT-Z6A-' + s).first().waitFor();
      await page.locator('tr', { hasText: 'OT-Z6A-' + s }).getByText('60 %').first().waitFor();
      await page.goto(B + `/proyectos/${proyecto}`);
      await page.getByTestId('costeo-proyecto').waitFor();
      const t = await page.getByTestId('costo-proyecto').textContent();
      if (!/237\.500/.test(t)) throw new Error('Consolidado inesperado: ' + t);
      if (!/70,31 %/.test(await page.getByTestId('margen-proyecto').textContent())) throw new Error('Margen de proyecto inesperado');
    });

    await paso('Edu (taller) no ve "Rentabilidad" y si escribe la URL vuelve a su pantalla', async () => {
      await entrar(`zz_test_edu6_${s}`);
      if (await page.getByRole('link', { name: 'Rentabilidad' }).count()) throw new Error('Edu ve el menú Rentabilidad');
      await page.goto(B + '/rentabilidad');
      await page.waitForURL((u) => !u.pathname.startsWith('/rentabilidad'));
    });

    if (errores.length) throw new Error(errores.join(' | '));
    console.log(`\n>>> RECORRIDO LOOP 6 EN VERDE: ${n}/${n} PASOS OK <<<\n`);
  } finally {
    await browser.close();
    if (usuarios.length) await sql`UPDATE usuario SET activo = false WHERE id = ANY(${usuarios}::uuid[])`;
    if (ids.personas.length) await sql`UPDATE persona SET activo = false WHERE id = ANY(${ids.personas}::uuid[])`;
    if (ids.clientes.length) await sql`UPDATE cliente SET activo = false WHERE id = ANY(${ids.clientes}::uuid[])`;
    if (ids.vehiculos.length) await sql`UPDATE vehiculo SET activo = false WHERE id = ANY(${ids.vehiculos}::uuid[])`;
    await sql.end({ timeout: 3 });
  }
})().catch(() => process.exit(1));
