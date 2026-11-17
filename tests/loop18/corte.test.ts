import { describe, it, expect, afterAll } from 'vitest';
import { admin, cerrarConexiones } from '../loop0/helpers.js';
import { sesion } from '../loop3/helpers-comercial.js';
import { calcularCorte } from '../../packages/shared/src/index.js';

/** Loop 18 — Edu carga medidas en cm con la medida total del material (docs/LOOP_18_MEDIDAS_CM_DISENO.md). */
afterAll(cerrarConexiones);
const uuid = () => crypto.randomUUID();

// Ejemplo de la reunión: adhesivo 137 × 691 cm; mc reservado 87 × 330 (OT A) e isla kellogs 90 × 303 (OT B).
const EJEMPLO = { anchoCm: 137, largoCm: 691, trabajos: [{ piezas: [{ anchoCm: 87, altoCm: 330, cantidad: 1 }] }, { piezas: [{ anchoCm: 90, altoCm: 303, cantidad: 1 }] }] };

describe('Loop 18 — fórmula del corte en cm', () => {
  it('CA-18.1: usados, piezas por trabajo y desperdicio repartido en proporción; Σ exacta', () => {
    const r = calcularCorte(EJEMPLO.anchoCm, EJEMPLO.largoCm, EJEMPLO.trabajos);
    expect(r.m2Usados).toBe(9.4667);
    expect(r.m2Piezas).toBe(5.598);
    expect(r.m2Desperdicio).toBe(3.8687);
    expect(r.porTrabajo.map((t) => t.m2Piezas)).toEqual([2.871, 2.727]);
    expect(r.porTrabajo.map((t) => t.m2Desperdicio)).toEqual([1.9841, 1.8846]);
    const suma = r.porTrabajo.reduce((a, t) => a + Math.round(t.m2Piezas * 1e4) + Math.round(t.m2Desperdicio * 1e4), 0);
    expect(suma).toBe(94667);
    expect(r.aprovechamientoPct).toBe(59.1);
  });

  it('CA-18.2: un solo trabajo con varias piezas, en cm, da lo mismo que la merma en metros', () => {
    const r = calcularCorte(152, 160, [{ piezas: [{ anchoCm: 100, altoCm: 50, cantidad: 3 }] }]);
    expect([r.m2Usados, r.m2Piezas, r.m2Desperdicio, r.aprovechamientoPct]).toEqual([2.432, 1.5, 0.932, 61.7]);
    expect(r.porTrabajo).toEqual([{ m2Piezas: 1.5, m2Desperdicio: 0.932, aprovechado: false }]);
  });

  it('centímetros con decimales (hasta 2) y sin desperdicio', () => {
    const r = calcularCorte(137.5, 100, [{ piezas: [{ anchoCm: 137.5, altoCm: 100, cantidad: 1 }] }]);
    expect([r.m2Usados, r.m2Desperdicio]).toEqual([1.375, 0]);
    expect(r.porTrabajo[0].m2Desperdicio).toBe(0);
  });

  it('CA-18.3: piezas que suman más que el material → error con los dos números', () => {
    expect(() => calcularCorte(137, 691, [
      { piezas: [{ anchoCm: 87, altoCm: 330, cantidad: 1 }, { anchoCm: 46, altoCm: 686, cantidad: 1 }] },
      { piezas: [{ anchoCm: 90, altoCm: 303, cantidad: 1 }, { anchoCm: 25, altoCm: 386, cantidad: 1 }] },
    ])).toThrow('Las piezas suman 9,7186 m² y el material 9,4667 m²');
  });
});

async function escenario() {
  const tag = uuid().slice(0, 8);
  const juan = await sesion(['admin']);
  const edu = await sesion(['taller']);
  const adh = (await juan('POST', '/api/insumos', { nombre: 'zz_test Adhesivo ' + tag, unidad: 'M2', costoUnitarioGs: 63000 })).j;
  const desp = (await juan('POST', '/api/insumos', { nombre: 'zz_test Adhesivo desperdicio ' + tag, unidad: 'M2', costoUnitarioGs: 15500 })).j;
  const tinta = (await juan('POST', '/api/insumos', { nombre: 'zz_test Tinta ' + tag, unidad: 'LITRO', costoUnitarioGs: 100000 })).j;
  const [c] = await admin`INSERT INTO cliente (codigo, nombre) VALUES (${'Z18' + tag}, ${'zz_test_cli18_' + tag}) RETURNING id`;
  const ot = async (t: string) => (await juan('POST', '/api/comercial/ot', { clienteId: c.id, titulo: 'zz_test ' + t })).j.id as string;
  return { juan, edu, adh: adh.id as string, desp: desp.id as string, tinta: tinta.id as string, a: await ot('A'), b: await ot('B') };
}
type Linea = { insumo_id: string; cantidad: number; es_desperdicio: boolean; nota: string };

describe('Loop 18 — POST /api/consumos/corte', () => {
  it('CA-18.1: dos OTs con su parte de piezas y de desperdicio (con precio de desperdicio)', async () => {
    const e = await escenario();
    const r = await e.edu('POST', '/api/consumos/corte', {
      insumoId: e.adh, insumoDesperdicioId: e.desp, anchoCm: 137, largoCm: 691, claveIdempotencia: uuid(),
      trabajos: [{ otId: e.a, piezas: EJEMPLO.trabajos[0].piezas }, { otId: e.b, piezas: EJEMPLO.trabajos[1].piezas }],
    });
    expect(r.status).toBe(201);
    expect(r.j.m2Desperdicio).toBe(3.8687);
    const lineas = async (ot: string) => ((await e.juan('GET', `/api/consumos/ot/${ot}`)).j as { items: Linea[] }).items;
    const [la, lb] = [await lineas(e.a), await lineas(e.b)];
    expect(la.map((l) => [l.insumo_id, l.cantidad, l.es_desperdicio])).toEqual([[e.adh, 2.871, false], [e.desp, 1.9841, true]]);
    expect(lb.map((l) => [l.insumo_id, l.cantidad, l.es_desperdicio])).toEqual([[e.adh, 2.727, false], [e.desp, 1.8846, true]]);
    expect(la[0].nota).toBe('Corte 137 × 691 cm · 2 trabajos · aprovechamiento 59,1 %');
    const grupos = await admin`SELECT DISTINCT grupo_id FROM consumo_insumo WHERE orden_trabajo_id IN (${e.a}, ${e.b})`;
    expect(grupos).toHaveLength(1);
  });

  it('CA-18.5: el reintento con la misma clave no duplica', async () => {
    const e = await escenario();
    const cuerpo = { insumoId: e.adh, anchoCm: 152, largoCm: 160, claveIdempotencia: uuid(), trabajos: [{ otId: e.a, piezas: [{ anchoCm: 100, altoCm: 50, cantidad: 3 }] }] };
    expect((await e.edu('POST', '/api/consumos/corte', cuerpo)).status).toBe(201);
    expect((await e.edu('POST', '/api/consumos/corte', cuerpo)).status).toBe(200);
    const [{ n }] = await admin`SELECT count(*)::int AS n FROM consumo_insumo WHERE orden_trabajo_id = ${e.a}`;
    expect(n).toBe(2);
  });

  it('CA-18.3 y 18.4: rechazos', async () => {
    const e = await escenario();
    const base = (extra: object) => ({ insumoId: e.adh, anchoCm: 137, largoCm: 100, claveIdempotencia: uuid(), trabajos: [{ otId: e.a, piezas: [{ anchoCm: 50, altoCm: 50, cantidad: 1 }] }], ...extra });
    const r1 = await e.edu('POST', '/api/consumos/corte', base({ largoCm: 10 }));
    expect(r1.status).toBe(400);
    expect(r1.j.error).toMatch(/Las piezas suman 0,25 m² y el material 0,137 m²/);
    expect((await e.edu('POST', '/api/consumos/corte', base({ trabajos: [{ otId: e.a, piezas: [{ anchoCm: 10, altoCm: 10, cantidad: 1 }] }, { otId: e.a, piezas: [{ anchoCm: 10, altoCm: 10, cantidad: 1 }] }] }))).status).toBe(400);
    expect((await e.edu('POST', '/api/consumos/corte', base({ insumoId: e.tinta }))).status).toBe(400);
    expect((await e.edu('POST', '/api/consumos/corte', base({ anchoCm: 0 }))).status).toBe(400);
    expect((await e.edu('POST', '/api/consumos/corte', base({ anchoCm: 10.123 }))).status).toBe(400);
    await admin`UPDATE orden_trabajo SET estado = 'CANCELADO' WHERE id = ${e.b}`;
    expect((await e.edu('POST', '/api/consumos/corte', base({ trabajos: [{ otId: e.b, piezas: [{ anchoCm: 10, altoCm: 10, cantidad: 1 }] }] }))).status).toBe(409);
  });
});

// L18.E2 — lo que Edu explicó por audio (17/11): pl mogul se imprime en el desperdicio de isla bob (dos trabajos
// distintos); no gasta adhesivo propio y "a Juan le sale gratis". Con el tilde, las cuentas cierran.
const EDU = {
  anchoCm: 137, largoCm: 691,
  trabajos: [
    { piezas: [{ anchoCm: 87, altoCm: 330, cantidad: 1 }] }, // mc reservado
    { piezas: [{ anchoCm: 46, altoCm: 686, cantidad: 1 }] }, // isla bob
    { piezas: [{ anchoCm: 90, altoCm: 303, cantidad: 1 }] }, // isla kellogs
    { piezas: [{ anchoCm: 25, altoCm: 386, cantidad: 1 }], deDesperdicioDe: 1 }, // pl mogul, en el desperdicio de bob
  ],
};

describe('L18.E2 — un trabajo que sale del desperdicio de otro', () => {
  it('no suma m² ni paga desperdicio; las demás reparten 0,7131 m²; aprovechamiento 92,5 %', () => {
    const r = calcularCorte(EDU.anchoCm, EDU.largoCm, EDU.trabajos);
    expect([r.m2Usados, r.m2Piezas, r.m2Desperdicio, r.aprovechamientoPct]).toEqual([9.4667, 8.7536, 0.7131, 92.5]);
    expect(r.porTrabajo).toEqual([
      { m2Piezas: 2.871, m2Desperdicio: 0.2339, aprovechado: false },
      { m2Piezas: 3.1556, m2Desperdicio: 0.257, aprovechado: false },
      { m2Piezas: 2.727, m2Desperdicio: 0.2222, aprovechado: false },
      { m2Piezas: 0.965, m2Desperdicio: 0, aprovechado: true },
    ]);
  });

  it('rechazos: más grande que su origen, origen que también es aprovechado, origen inexistente o todos aprovechados', () => {
    const piezas = (a: number, b: number) => [{ anchoCm: a, altoCm: b, cantidad: 1 }];
    expect(() => calcularCorte(100, 100, [{ piezas: piezas(10, 10) }, { piezas: piezas(20, 20), deDesperdicioDe: 0 }])).toThrow(/más grande que el trabajo del que sale/);
    expect(() => calcularCorte(100, 100, [{ piezas: piezas(50, 50) }, { piezas: piezas(10, 10), deDesperdicioDe: 2 }, { piezas: piezas(5, 5), deDesperdicioDe: 1 }])).toThrow(/sale de otro trabajo que también/);
    expect(() => calcularCorte(100, 100, [{ piezas: piezas(50, 50) }, { piezas: piezas(10, 10), deDesperdicioDe: 7 }])).toThrow(/no está en este corte/);
    expect(() => calcularCorte(100, 100, [{ piezas: piezas(50, 50), deDesperdicioDe: 0 }])).toThrow();
  });

  it('API: la OT que aprovecha queda con su línea en m² a Gs. 0 y la nota dice de dónde salió', async () => {
    const e = await escenario();
    const [c] = await admin`SELECT cliente_id FROM orden_trabajo WHERE id = ${e.a}`;
    const otC = (await e.juan('POST', '/api/comercial/ot', { clienteId: c.cliente_id, titulo: 'zz_test kellogs' })).j.id as string;
    const otD = (await e.juan('POST', '/api/comercial/ot', { clienteId: c.cliente_id, titulo: 'zz_test mogul' })).j.id as string;
    const ids = [e.a, e.b, otC, otD];
    const r = await e.edu('POST', '/api/consumos/corte', {
      insumoId: e.adh, anchoCm: 137, largoCm: 691, claveIdempotencia: uuid(),
      trabajos: EDU.trabajos.map((t, i) => ({ otId: ids[i], piezas: t.piezas, ...(t.deDesperdicioDe !== undefined ? { aprovechaDesperdicioDe: ids[t.deDesperdicioDe] } : {}) })),
    });
    expect(r.status).toBe(201);
    const items = ((await e.juan('GET', `/api/consumos/ot/${otD}`)).j as { items: (Linea & { total_gs: number })[] }).items;
    expect(items.map((l) => [l.cantidad, l.total_gs, l.es_desperdicio])).toEqual([[0.965, 0, false]]);
    const [codB] = await admin`SELECT codigo_ot FROM orden_trabajo WHERE id = ${e.b}`;
    expect(items[0].nota).toContain(`aprovecha el desperdicio de ${codB.codigo_ot}`);
    const deB = ((await e.juan('GET', `/api/consumos/ot/${e.b}`)).j as { items: Linea[] }).items;
    expect(deB.map((l) => l.cantidad)).toEqual([3.1556, 0.257]);
    const [{ total }] = await admin`SELECT sum(cantidad * costo_unitario_gs)::float8 AS total FROM consumo_insumo WHERE orden_trabajo_id = ANY(${ids}::uuid[])`;
    expect(total).toBeCloseTo(9.4667 * 63000, 6);
  });
});
