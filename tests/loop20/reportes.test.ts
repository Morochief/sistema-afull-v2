import { describe, it, expect, afterAll } from 'vitest';
import ExcelJS from 'exceljs';
import { admin, cerrarConexiones } from '../loop0/helpers.js';
import { crearUsuario, post } from '../loop0/auth-helpers.js';
import { sesion } from '../loop3/helpers-comercial.js';
import { app } from '../../apps/api/src/index.js';

/** Loop 20 — reportes (docs/LOOP_20_REPORTES_DISENO.md). */
const personas: string[] = [];
afterAll(async () => {
  await admin`UPDATE tarea_intervalo SET hora_fin = greatest(clock_timestamp(), hora_inicio), motivo_cierre = 'FIN' WHERE hora_fin IS NULL AND persona_id = ANY(${personas}::uuid[])`;
  await admin`UPDATE persona SET activo = false WHERE id = ANY(${personas}::uuid[])`;
  await cerrarConexiones();
});
const uuid = () => crypto.randomUUID();
const ORIGEN = process.env.APP_ORIGIN || 'http://localhost:3000';
type Fila = { fecha: string; concepto: string; descripcion: string; hs_inicio: string | null; hs_fin: string | null; cantidad: number; unidad: string; precio_unitario: number; total_gs: number; ot_codigo: string; cliente: string; proyecto: string | null };
type Registros = { items: Fila[]; total: number; totales: { mano_obra_gs: number; insumos_gs: number; vehiculos_gs: number; total_gs: number; minutos: number } };

async function descargar(caps: string[], path: string) {
  const u = await crearUsuario(caps);
  const r = await post('/api/auth/login', { username: u.username, password: 'Password123!' });
  const res = await app.request(path, { headers: { origin: ORIGEN, cookie: r.headers.get('set-cookie')!.split(';')[0] } });
  return res;
}

/**
 * Escenario CA-20.1 (fechas de octubre, fuera de cualquier otro dato de prueba por cliente propio):
 * OT1 del proyecto: Edu 1 h a 21.000 (10/10 08:00–09:00); 3 m² de lona a 18.000 y 0,5 m² de desperdicio;
 * viaje de 30 km a 2.000/km repartido entre OT1 y OT2 → 21.000 + 54.000 + 9.000 + 30.000 = 114.000.
 */
async function escenario() {
  const tag = uuid().slice(0, 8);
  const juan = await sesion(['admin']);
  const edu = await sesion(['taller']);
  const [pE] = await admin`INSERT INTO persona (nombre, ci) VALUES (${'zz_test_Edu20 ' + tag}, ${'R20E' + tag}) RETURNING id`;
  const [pN] = await admin`INSERT INTO persona (nombre, ci) VALUES (${'zz_test_Nachi20 ' + tag}, ${'R20N' + tag}) RETURNING id`;
  personas.push(pE.id as string, pN.id as string);
  await admin`UPDATE usuario SET persona_id = ${pE.id} WHERE id = ${edu.usuarioId}`;
  await admin`INSERT INTO tarifa_persona (persona_id, tarifa_hora_gs, fecha_inicio) VALUES (${pE.id}, 21000, '2026-01-01')`;
  const [c] = await admin`INSERT INTO cliente (codigo, nombre, razon_social, ruc) VALUES (${'Z20' + tag}, ${'zz_test_cli20_' + tag}, 'zz_test SA', ${'80' + tag.slice(0, 6) + '-1'}) RETURNING id`;
  const [py] = await admin`INSERT INTO proyecto (codigo, cliente_id, nombre, creado_por) VALUES (${'PRY-Z20-' + tag}, ${c.id}, 'zz_test casetas', ${juan.usuarioId}) RETURNING id`;
  const ot = async (k: string, monto: number | null) => (await admin`
    INSERT INTO orden_trabajo (codigo_ot, cliente_id, titulo, creado_por, proyecto_id, monto_presupuestado_gs)
    VALUES (${`OT-Z20${k}-${tag}`}, ${c.id}, ${'zz_test ' + k}, ${juan.usuarioId}, ${py.id}, ${monto}) RETURNING id`)[0].id as string;
  const ot1 = await ot('A', 200000);
  const ot2 = await ot('B', null);
  const tarea = async (otId: string, persona: string, tipo: string, desc: string) => (await admin`
    INSERT INTO tarea (orden_trabajo_id, persona_asignada_id, tipo, descripcion, orden_secuencia, creado_por)
    VALUES (${otId}, ${persona}, ${tipo}, ${desc}, 1, ${juan.usuarioId}) RETURNING id`)[0].id as string;
  const tE = await tarea(ot1, pE.id, 'TALLER_IMPRESION', 'Imprimir lona');
  const tramo = async (t: string, p: string, ini: string, fin: string | null, extra: { tanda?: string } = {}) => (await admin`
    INSERT INTO tarea_intervalo (tarea_id, persona_id, hora_inicio, hora_fin, motivo_cierre, clave_idempotencia, tanda_id)
    VALUES (${t}, ${p}, ${ini}, ${fin}, ${fin ? 'FIN' : null}, ${uuid()}, ${extra.tanda ?? null}) RETURNING id`)[0].id as string;
  await tramo(tE, pE.id, '2026-10-10T08:00:00-03:00', '2026-10-10T09:00:00-03:00');
  const lona = (await juan('POST', '/api/insumos', { nombre: 'zz_test Lona20 ' + tag, unidad: 'M2', costoUnitarioGs: 18000 })).j.id as string;
  // Consumos con fecha de octubre (la API los fecha hoy y la tabla es inmutable): se insertan directo.
  const consumo = (cantidad: number, desp: boolean) => admin`
    INSERT INTO consumo_insumo (orden_trabajo_id, insumo_id, persona_id, cargado_por, cantidad, costo_unitario_gs, es_desperdicio, clave_idempotencia, created_at)
    VALUES (${ot1}, ${lona}, ${pE.id}, ${edu.usuarioId}, ${cantidad}, 18000, ${desp}, ${uuid()}, '2026-10-10T10:00:00-03:00')`;
  await consumo(3, false);
  await consumo(0.5, true);
  const [v] = await admin`INSERT INTO vehiculo (chapa, marca_modelo, costo_km_gs) VALUES (${'Z20' + tag.toUpperCase()}, 'zz_test Hilux', 2000) RETURNING id`;
  const [h] = await admin`INSERT INTO hoja_ruta (fecha, vehiculo_id, creado_por) VALUES ('2026-10-12', ${v.id}, ${juan.usuarioId}) RETURNING id`;
  await admin`INSERT INTO hoja_ruta_parada (hoja_ruta_id, orden_trabajo_id, orden_secuencia, estado) VALUES (${h.id}, ${ot1}, 1, 'COMPLETADA'), (${h.id}, ${ot2}, 2, 'COMPLETADA')`;
  await admin`INSERT INTO viaje (vehiculo_id, conductor_persona_id, hoja_ruta_id, km_inicio, km_fin, hora_inicio, hora_fin, clave_idempotencia)
              VALUES (${v.id}, ${pE.id}, ${h.id}, 1000, 1030, '2026-10-12T08:00:00-03:00', '2026-10-12T12:00:00-03:00', ${uuid()})`;
  return { juan, edu, tag, cliente: c.id as string, proyecto: py.id as string, ot1, ot2, pE: pE.id as string, pN: pN.id as string, tE, tramo, tarea, lona };
}
const q = (e: { cliente: string }, extra = '') => `/api/reportes/registros?desde=2026-10-01&hasta=2026-10-31&clienteId=${e.cliente}${extra}`;

describe('Loop 20 — registros (el Excel de Juan)', () => {
  it('CA-20.1: MO, insumo, desperdicio y vehículo con las columnas del Excel; igual al costo de la OT', async () => {
    const e = await escenario();
    const r = (await e.juan('GET', q(e))).j as unknown as Registros;
    const de1 = r.items.filter((f) => f.ot_codigo.startsWith('OT-Z20A'));
    const mo = de1.find((f) => f.concepto === 'MO')!;
    expect(mo).toMatchObject({ fecha: '2026-10-10', hs_inicio: '08:00', hs_fin: '09:00', cantidad: 60, unidad: 'min', precio_unitario: 350, total_gs: 21000, proyecto: expect.stringContaining('zz_test casetas') });
    expect(mo.descripcion).toBe(`zz_test_Edu20 ${e.tag} · Imprimir lona`);
    expect(de1.filter((f) => f.concepto === 'Insumo').map((f) => [f.cantidad, f.precio_unitario, f.total_gs, /desperdicio/.test(f.descripcion)]))
      .toEqual(expect.arrayContaining([[3, 18000, 54000, false], [0.5, 18000, 9000, true]]));
    expect(de1.find((f) => f.concepto === 'Vehículo')).toMatchObject({ cantidad: 15, unidad: 'km', precio_unitario: 2000, total_gs: 30000 });
    expect(de1.reduce((a, f) => a + f.total_gs, 0)).toBe(114000);
    const costo = (await e.juan('GET', `/api/costeo/ot/${e.ot1}`)).j as { total_gs: number };
    expect(costo.total_gs).toBe(114000);
    expect(r.totales).toMatchObject({ mano_obra_gs: 21000, insumos_gs: 63000, vehiculos_gs: 60000, total_gs: 144000, minutos: 60 });
  });

  it('CA-20.2: una tanda se reparte por m²; una corrección acorta; un tramo a mano lo dice', async () => {
    const e = await escenario();
    const tB = await e.tarea(e.ot2, e.pE, 'TALLER_IMPRESION', 'Imprimir lona B');
    const [t] = await admin`INSERT INTO tanda (persona_id, tarea_principal_id, creada_por, clave_idempotencia) VALUES (${e.pE}, ${e.tE}, ${e.juan.usuarioId}, ${uuid()}) RETURNING id`;
    await admin`INSERT INTO tanda_tarea (tanda_id, tarea_id, m2_piezas, orden) VALUES (${t.id}, ${e.tE}, 2, 1), (${t.id}, ${tB}, 1, 2)`;
    await e.tramo(e.tE, e.pE, '2026-10-11T08:00:00-03:00', '2026-10-11T09:00:00-03:00', { tanda: t.id as string });
    const corr = await e.tramo(e.tE, e.pE, '2026-10-13T08:00:00-03:00', '2026-10-13T12:00:00-03:00');
    await admin`INSERT INTO intervalo_correccion (intervalo_id, hora_fin_corregida, motivo, corregido_por) VALUES (${corr}, '2026-10-13T10:00:00-03:00', 'zz_test', ${e.juan.usuarioId})`;
    await admin`INSERT INTO tarea_intervalo (tarea_id, persona_id, hora_inicio, hora_fin, motivo_cierre, clave_idempotencia, origen, cargado_por, motivo_manual)
                VALUES (${e.tE}, ${e.pE}, '2026-10-14T14:00:00-03:00', '2026-10-14T15:00:00-03:00', 'FIN', ${uuid()}, 'MANUAL', ${e.juan.usuarioId}, 'zz_test sin celular')`;
    const mo = ((await e.juan('GET', q(e, '&concepto=MO'))).j as unknown as Registros).items;
    const del11 = mo.filter((f) => f.fecha === '2026-10-11');
    expect(del11.map((f) => [f.ot_codigo.slice(0, 7), f.cantidad, f.total_gs]).sort()).toEqual([['OT-Z20A', 40, 14000], ['OT-Z20B', 20, 7000]]);
    expect(del11[0].descripcion).toMatch(/tanda/);
    const del13 = mo.find((f) => f.fecha === '2026-10-13')!;
    expect([del13.hs_fin, del13.cantidad, del13.total_gs]).toEqual(['10:00', 120, 42000]);
    expect(del13.descripcion).toMatch(/corregido/);
    expect(mo.find((f) => f.fecha === '2026-10-14')!.descripcion).toMatch(/a mano/);
  });

  it('CA-20.3: filtros por persona y concepto, rango de fechas y páginas de 25', async () => {
    const e = await escenario();
    const solo = (await e.juan('GET', q(e, `&personaId=${e.pE}`))).j as unknown as Registros;
    expect(solo.items.every((f) => f.concepto === 'MO')).toBe(true);
    const veh = (await e.juan('GET', q(e, '&concepto=VEHICULO'))).j as unknown as Registros;
    expect(veh.items.map((f) => f.concepto)).toEqual(['Vehículo', 'Vehículo']);
    const fuera = (await e.juan('GET', `/api/reportes/registros?desde=2026-11-01&hasta=2026-11-30&clienteId=${e.cliente}`)).j as unknown as Registros;
    expect(fuera.total).toBe(0);
    const hh = (min: number) => `2026-10-20T${String(8 + Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}:00-03:00`;
    for (let i = 0; i < 30; i++) await e.tramo(e.tE, e.pE, hh(i * 10), hh(i * 10 + 5));
    const p1 = (await e.juan('GET', q(e))).j as unknown as Registros;
    const p2 = (await e.juan('GET', q(e, '&pagina=2'))).j as unknown as Registros;
    expect([p1.items.length, p2.items.length, p1.total]).toEqual([25, 10, 35]);
    expect((await e.juan('GET', '/api/reportes/registros?desde=2025-01-01&hasta=2026-10-31')).status).toBe(400); // más de 366 días
  });

  it('CA-20.4: el Excel tiene las columnas del Excel de Juan, números como números y fórmulas escapadas', async () => {
    const e = await escenario();
    await admin`UPDATE cliente SET nombre = ${'=HYPERLINK("http://x") ' + e.tag} WHERE id = ${e.cliente}`;
    const res = await descargar(['admin'], q(e).replace('/registros?', '/registros.xlsx?'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/spreadsheetml/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await res.arrayBuffer());
    const hoja = wb.getWorksheet('Registros')!;
    expect((hoja.getRow(1).values as unknown[]).slice(1)).toEqual(['Proyecto', 'OT', 'Fecha', 'Cliente', 'Concepto', 'Descripción', 'Hs Inicio', 'Hs Fin', 'Hs Total', 'Cantidad', 'Unidad', 'Precio Unitario', 'Total']);
    const filas = hoja.getSheetValues().slice(2).filter(Boolean) as unknown[][];
    expect(filas.length).toBe(5);
    expect(filas.reduce((a, f) => a + (f[13] as number), 0)).toBe(144000);
    const mo = filas.find((f) => f[5] === 'MO')!;
    expect([typeof mo[10], mo[12], mo[9]]).toEqual(['number', 350, '01:00']);
    expect(String(mo[4]).startsWith("'=HYPERLINK")).toBe(true); // el cliente empieza con "=": queda escapado
    expect(String(mo[6])).toBe(`zz_test_Edu20 ${e.tag} · Imprimir lona`);
    expect(wb.getWorksheet('Resumen')).toBeTruthy();
  });
});

describe('Loop 20 — horas para pagar y pre-factura', () => {
  it('CA-20.5: horas por persona × tarifa; sin tarifa avisa; reloj abierto avisa y no suma; la tanda cuenta entera', async () => {
    const e = await escenario();
    const tN = await e.tarea(e.ot1, e.pN, 'DISENO', 'Arte');
    await e.tramo(e.tE, e.pE, '2026-10-15T08:00:00-03:00', '2026-10-15T09:00:00-03:00');
    await e.tramo(tN, e.pN, '2026-10-15T08:00:00-03:00', '2026-10-15T09:00:00-03:00');
    await e.tramo(tN, e.pN, '2026-10-16T08:00:00-03:00', null);
    const sofi = await sesion(['rrhh']);
    const r = (await sofi('GET', '/api/reportes/horas?desde=2026-10-01&hasta=2026-10-31')).j as { items: { persona_id: string; segundos: number; tramos: number; total_gs: number; sin_tarifa: boolean; reloj_abierto: boolean }[] };
    const edu = r.items.find((x) => x.persona_id === e.pE)!;
    const nachi = r.items.find((x) => x.persona_id === e.pN)!;
    expect([edu.segundos, edu.tramos, edu.total_gs, edu.sin_tarifa]).toEqual([7200, 2, 42000, false]);
    expect([nachi.segundos, nachi.total_gs, nachi.sin_tarifa, nachi.reloj_abierto]).toEqual([3600, 0, true, true]);
    const res = await descargar(['rrhh'], '/api/reportes/horas.xlsx?desde=2026-10-01&hasta=2026-10-31');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await res.arrayBuffer());
    expect(wb.getWorksheet('Resumen')).toBeTruthy();
    expect(wb.getWorksheet('Detalle')!.rowCount).toBeGreaterThan(3);
  });

  it('CA-20.6: pre-factura por proyecto: cliente, OTs, costos y monto presupuestado', async () => {
    const e = await escenario();
    const p = (await e.juan('GET', `/api/reportes/prefactura?proyectoId=${e.proyecto}`)).j as Record<string, unknown> & { ots: unknown[]; cliente: { ruc: string; razon_social: string }; registros: unknown[] };
    expect(p).toMatchObject({ mano_obra_gs: 21000, insumos_gs: 63000, vehiculos_gs: 60000, costo_base_gs: 144000, monto_presupuestado_gs: 200000 });
    expect(p.ots).toHaveLength(2);
    expect(p.cliente.razon_social).toBe('zz_test SA');
    expect(p.registros).toHaveLength(5);
    const porCliente = (await e.juan('GET', `/api/reportes/prefactura?clienteId=${e.cliente}&desde=2026-10-01&hasta=2026-10-31`)).j as { costo_base_gs: number };
    expect(porCliente.costo_base_gs).toBe(144000);
    expect((await e.juan('GET', '/api/reportes/prefactura')).status).toBe(400);
  });

  it('CA-20.7: permisos', async () => {
    const e = await escenario();
    const taller = await sesion(['taller']);
    const comercial = await sesion(['comercial']);
    const rrhh = await sesion(['rrhh']);
    expect((await taller('GET', q(e))).status).toBe(403);
    expect((await taller('GET', '/api/reportes/horas?desde=2026-10-01&hasta=2026-10-31')).status).toBe(403);
    expect((await comercial('GET', q(e))).status).toBe(200);
    expect((await comercial('GET', '/api/reportes/horas?desde=2026-10-01&hasta=2026-10-31')).status).toBe(403);
    expect((await rrhh('GET', q(e))).status).toBe(403);
    expect((await rrhh('GET', `/api/reportes/prefactura?proyectoId=${e.proyecto}`)).status).toBe(403);
  });
});
