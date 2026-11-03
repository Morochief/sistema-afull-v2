import { describe, it, expect, afterAll } from 'vitest';
import { admin, api as apiDb, cerrarConexiones } from '../loop0/helpers.js';
import { sesion } from '../loop3/helpers-comercial.js';

afterAll(cerrarConexiones);
const uuid = () => crypto.randomUUID();
type Costeo = {
  congelado: boolean; horas: number; mano_obra_gs: number; material_gs: number; desperdicio_gs: number; km: number; km_gs: number;
  total_gs: number; monto_presupuestado_gs: number | null; margen_pct: number | null; alertas: string[];
  mano_obra: { persona: string; horas: number; costo_gs: number; sin_tarifa: boolean }[];
};

/**
 * Escenario: proyecto con 2 OTs (venta 500.000 y 300.000) y una tercera OT cuya parada se omitió.
 * OT1: Edu 2 h a 20.000/h (+ Nachi 1 h sin tarifa) · 3 m² + 0,5 m² de desperdicio a 35.000 · viaje de 30 km a 2.500/km
 * repartido entre OT1 y OT2 (la OT omitida no paga) → 40.000 + 122.500 + 37.500 = 200.000; margen 60 %.
 */
async function escenario() {
  const tag = uuid().slice(0, 8);
  const sofi = await sesion(['comercial']);
  const edu = await sesion(['taller']);
  const [pE] = await admin`INSERT INTO persona (nombre, ci) VALUES (${'zz_test_Edu6 ' + tag}, ${'C6E' + tag}) RETURNING id`;
  const [pN] = await admin`INSERT INTO persona (nombre, ci) VALUES (${'zz_test_Nachi6 ' + tag}, ${'C6N' + tag}) RETURNING id`;
  await admin`UPDATE usuario SET persona_id = ${pE.id} WHERE id = ${edu.usuarioId}`;
  await admin`INSERT INTO tarifa_persona (persona_id, tarifa_hora_gs, fecha_inicio) VALUES (${pE.id}, 20000, '2026-01-01')`;
  const [c] = await admin`INSERT INTO cliente (codigo, nombre) VALUES (${'Z6' + tag}, ${'zz_test_cli6_' + tag}) RETURNING id`;
  const [py] = await admin`INSERT INTO proyecto (codigo, cliente_id, nombre, creado_por) VALUES (${'PRY-Z6-' + tag}, ${c.id}, 'zz_test proyecto costeo', ${sofi.usuarioId}) RETURNING id`;
  const ot = async (sufijo: string, monto: number | null, proyecto: string | null) => {
    const [o] = await admin`
      INSERT INTO orden_trabajo (codigo_ot, cliente_id, titulo, creado_por, proyecto_id, monto_presupuestado_gs)
      VALUES (${`OT-Z6${sufijo}-${tag}`}, ${c.id}, ${'zz_test costeo ' + sufijo}, ${sofi.usuarioId}, ${proyecto}, ${monto}) RETURNING id
    `;
    await admin`INSERT INTO ot_evento (orden_trabajo_id, estado_nuevo, autor_id) VALUES (${o.id}, 'PENDIENTE', ${sofi.usuarioId})`;
    return o.id as string;
  };
  const ot1 = await ot('A', 500000, py.id);
  const ot2 = await ot('B', 300000, py.id);
  const ot3 = await ot('C', null, null);
  const tarea = async (persona: string, tipo: string) => (await admin`
    INSERT INTO tarea (orden_trabajo_id, persona_asignada_id, tipo, descripcion, orden_secuencia, creado_por)
    VALUES (${ot1}, ${persona}, ${tipo}, 'zz_test', 1, ${sofi.usuarioId}) RETURNING id`)[0].id as string;
  const tE = await tarea(pE.id, 'TALLER_IMPRESION');
  const tN = await tarea(pN.id, 'DISENO');
  const intervalo = (t: string, p: string, ini: string, fin: string) =>
    admin`INSERT INTO tarea_intervalo (tarea_id, persona_id, hora_inicio, hora_fin, motivo_cierre, clave_idempotencia) VALUES (${t}, ${p}, ${ini}, ${fin}, 'FIN', ${uuid()})`;
  await intervalo(tE, pE.id, '2026-10-10T10:00:00-03:00', '2026-10-10T11:30:00-03:00');
  await intervalo(tE, pE.id, '2026-10-11T08:00:00-03:00', '2026-10-11T08:30:00-03:00');
  await intervalo(tN, pN.id, '2026-10-10T09:00:00-03:00', '2026-10-10T10:00:00-03:00');
  const juan = await sesion(['admin']);
  const lona = (await juan('POST', '/api/insumos', { nombre: 'zz_test Lona6 ' + tag, unidad: 'M2', costoUnitarioGs: 35000 })).j.id as string;
  await edu('POST', '/api/consumos', { otId: ot1, insumoId: lona, cantidad: 3, claveIdempotencia: uuid() });
  await edu('POST', '/api/consumos', { otId: ot1, insumoId: lona, cantidad: 0.5, esDesperdicio: true, claveIdempotencia: uuid() });
  const [v] = await admin`INSERT INTO vehiculo (chapa, marca_modelo, costo_km_gs) VALUES (${'Z6' + tag.toUpperCase()}, 'zz_test Hilux', 2500) RETURNING id`;
  const [h] = await admin`INSERT INTO hoja_ruta (fecha, vehiculo_id, creado_por) VALUES ('2026-10-12', ${v.id}, ${sofi.usuarioId}) RETURNING id`;
  await admin`INSERT INTO hoja_ruta_parada (hoja_ruta_id, orden_trabajo_id, orden_secuencia, estado) VALUES (${h.id}, ${ot1}, 1, 'COMPLETADA'), (${h.id}, ${ot2}, 2, 'COMPLETADA')`;
  await admin`INSERT INTO hoja_ruta_parada (hoja_ruta_id, orden_trabajo_id, orden_secuencia, estado, motivo_omision) VALUES (${h.id}, ${ot3}, 3, 'OMITIDA', 'zz_test lluvia')`;
  await admin`
    INSERT INTO viaje (vehiculo_id, conductor_persona_id, hoja_ruta_id, km_inicio, km_fin, hora_inicio, hora_fin, clave_idempotencia)
    VALUES (${v.id}, ${pE.id}, ${h.id}, 1000, 1030, '2026-10-12T08:00:00-03:00', '2026-10-12T12:00:00-03:00', ${uuid()})
  `;
  return { sofi, edu, ot1, ot2, ot3, proyecto: py.id as string, vehiculo: v.id as string, tag };
}

describe('Loop 6 — costeo real por OT', () => {
  it('a la fecha: horas × tarifa del día + material congelado + km repartidos; margen sobre la venta (CA-6.1)', async () => {
    const e = await escenario();
    const c = (await e.sofi('GET', `/api/costeo/ot/${e.ot1}`)).j as unknown as Costeo;
    expect(c.congelado).toBe(false);
    expect(c.horas).toBe(3);
    expect(c.mano_obra_gs).toBe(40000);
    expect(c.material_gs).toBe(122500);
    expect(c.desperdicio_gs).toBe(17500);
    expect([c.km, c.km_gs]).toEqual([15, 37500]);
    expect(c.total_gs).toBe(200000);
    expect(c.margen_pct).toBe(60);
    expect(c.mano_obra.find((m) => m.sin_tarifa)?.horas).toBe(1);
    expect(c.alertas.join(' ')).toMatch(/sin tarifa/);
    // La OT con la parada omitida no paga km.
    const c3 = (await e.sofi('GET', `/api/costeo/ot/${e.ot3}`)).j as unknown as Costeo;
    expect([c3.km_gs, c3.margen_pct]).toEqual([0, null]);
  });

  it('al terminar la OT se congela en la misma transacción; un precio nuevo después no lo cambia (CA-6.2)', async () => {
    const e = await escenario();
    await e.sofi('POST', `/api/comercial/ot/${e.ot1}/transicionar`, { desde: 'PENDIENTE', a: 'EN_TALLER' });
    expect((await e.sofi('POST', `/api/comercial/ot/${e.ot1}/transicionar`, { desde: 'EN_TALLER', a: 'TERMINADO' })).status).toBe(200);
    await admin`UPDATE vehiculo SET costo_km_gs = 9999 WHERE id = ${e.vehiculo}`;
    const c = (await e.sofi('GET', `/api/costeo/ot/${e.ot1}`)).j as unknown as Costeo;
    expect([c.congelado, c.km_gs, c.total_gs, c.margen_pct]).toEqual([true, 37500, 200000, 60]);
    // La OT abierta del mismo viaje sí ve el costo nuevo.
    expect(((await e.sofi('GET', `/api/costeo/ot/${e.ot2}`)).j as unknown as Costeo).km_gs).toBe(15 * 9999);
    // El snapshot es inmutable para la API y hay uno solo por OT.
    await expect(apiDb`UPDATE ot_costeo SET total_gs = 1 WHERE orden_trabajo_id = ${e.ot1}`).rejects.toThrow();
    await expect(apiDb`DELETE FROM ot_costeo WHERE orden_trabajo_id = ${e.ot1}`).rejects.toThrow();
    const [{ n }] = await admin`SELECT count(*)::int AS n FROM ot_costeo WHERE orden_trabajo_id = ${e.ot1}`;
    expect(n).toBe(1);
  });

  it('cancelar también congela; proyecto consolidado y listado de rentabilidad (CA-6.3)', async () => {
    const e = await escenario();
    await e.sofi('POST', `/api/comercial/ot/${e.ot2}/transicionar`, { desde: 'PENDIENTE', a: 'CANCELADO', comentario: 'zz_test cliente desistió' });
    const p = (await e.sofi('GET', `/api/costeo/proyecto/${e.proyecto}`)).j as unknown as { ots: unknown[]; total_gs: number; monto_presupuestado_gs: number; margen_pct: number };
    expect(p.ots).toHaveLength(2);
    expect(p.total_gs).toBe(200000 + 37500);
    expect(p.monto_presupuestado_gs).toBe(800000);
    expect(p.margen_pct).toBe(70.31);
    const l = (await e.sofi('GET', `/api/costeo/ots?q=${encodeURIComponent('OT-Z6B-' + e.tag)}&estado=CANCELADO`)).j as unknown as {
      items: { total_gs: number; margen_pct: number }[]; total: number; tamPagina: number; resumen: { venta_gs: number; costo_gs: number };
    };
    expect([l.total, l.tamPagina, l.items[0].total_gs]).toEqual([1, 25, 37500]);
    expect(l.resumen).toMatchObject({ venta_gs: 300000, costo_gs: 37500 });
    expect((await e.sofi('GET', `/api/costeo/ots?q=${encodeURIComponent('OT-Z6B-' + e.tag)}&estado=TERMINADO`)).j.total).toBe(0);
  });

  it('solo admin y comercial: taller, montaje y diseño reciben 403 (CA-6.4)', async () => {
    const e = await escenario();
    for (const caps of [['taller'], ['montaje'], ['diseno'], ['rrhh']]) {
      const s = await sesion(caps);
      for (const ruta of [`/api/costeo/ot/${e.ot1}`, `/api/costeo/proyecto/${e.proyecto}`, '/api/costeo/ots']) expect((await s('GET', ruta)).status).toBe(403);
    }
  });
});
