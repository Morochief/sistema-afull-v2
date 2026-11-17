import { describe, it, expect, afterAll } from 'vitest';
import { admin, cerrarConexiones } from '../loop0/helpers.js';
import { sesion } from '../loop3/helpers-comercial.js';

/** Loop 15 — lo que ya terminé (docs/LOOP_15_HISTORIAL_TERMINADAS_DISENO.md). */
const personas: string[] = [];
afterAll(async () => {
  await admin`UPDATE tarea_intervalo SET hora_fin = greatest(clock_timestamp(), hora_inicio), motivo_cierre = 'FIN'
              WHERE hora_fin IS NULL AND persona_id = ANY(${personas}::uuid[])`;
  await admin`UPDATE persona SET activo = false WHERE id = ANY(${personas}::uuid[])`;
  await cerrarConexiones();
});
const uuid = () => crypto.randomUUID();
type Item = { tarea_id: string; ot_codigo: string; cliente_nombre: string; descripcion: string; terminada_at: string; segundos: number; cantidad: number | null; unidad: string | null };
type Resp = { items: Item[]; total: number; pagina: number; horas_periodo_segundos: number };

async function escenario() {
  const tag = uuid().slice(0, 8);
  const jefe = await sesion(['admin']);
  const op = await sesion(['taller']);
  const [p] = await admin`INSERT INTO persona (nombre, ci) VALUES (${'zz_test_op15_' + tag}, ${'T15' + tag}) RETURNING id`;
  personas.push(p.id as string);
  await admin`UPDATE usuario SET persona_id = ${p.id} WHERE id = ${op.usuarioId}`;
  await admin`INSERT INTO tarifa_persona (persona_id, tarifa_hora_gs, fecha_inicio) VALUES (${p.id}, 21000, '2026-01-01')`;
  const [c] = await admin`INSERT INTO cliente (codigo, nombre) VALUES (${'Z15' + tag}, ${'zz_test_cli15_' + tag}) RETURNING id`;
  const [o] = await admin`INSERT INTO orden_trabajo (codigo_ot, cliente_id, titulo, creado_por) VALUES (${'OT15-' + tag}, ${c.id}, 'zz_test', ${jefe.usuarioId}) RETURNING id`;
  let orden = 0;
  /** Tarea con tramos cerrados [inicio, fin] y, si `terminada`, el evento LISTO a esa hora. */
  const tarea = async (persona: string, tramos: [string, string][], terminada: string | null, extra: { cantidad?: number; unidad?: string } = {}) => {
    orden += 1;
    const [t] = await admin`INSERT INTO tarea (orden_trabajo_id, persona_asignada_id, tipo, descripcion, orden_secuencia, creado_por, estado, cantidad, unidad)
      VALUES (${o.id}, ${persona}, 'TALLER_IMPRESION', ${'zz_test tarea ' + orden}, ${orden}, ${jefe.usuarioId}, ${terminada ? 'LISTO' : 'PAUSADA'},
              ${extra.cantidad ?? null}, ${extra.unidad ?? null}) RETURNING id`;
    for (const [a, b] of tramos) {
      await admin`INSERT INTO tarea_intervalo (tarea_id, persona_id, hora_inicio, hora_fin, motivo_cierre, clave_idempotencia)
                  VALUES (${t.id}, ${persona}, ${a}, ${b}, 'PAUSA', ${uuid()})`;
    }
    if (terminada) {
      await admin`INSERT INTO tarea_evento (tarea_id, estado_anterior, estado_nuevo, autor_id, created_at) VALUES (${t.id}, 'EN_CURSO', 'LISTO', ${jefe.usuarioId}, ${terminada})`;
    }
    return t.id as string;
  };
  const ver = async (q: string) => {
    const r = await op('GET', `/api/mi-trabajo/terminadas?${q}`);
    expect(r.status).toBe(200);
    return r.j as unknown as Resp;
  };
  return { op, jefe, persona: p.id as string, tarea, ver, tag };
}

describe('Loop 15 — lo que ya terminé', () => {
  it('CA-15.1/15.4/15.5: la terminada aparece con su tiempo; las horas del período suman también lo no terminado; sin montos', async () => {
    const e = await escenario();
    const t = await e.tarea(e.persona, [['2026-10-05T08:00:00-03:00', '2026-10-05T08:30:00-03:00'], ['2026-10-05T10:00:00-03:00', '2026-10-05T10:30:00-03:00']],
      '2026-10-05T10:31:00-03:00', { cantidad: 3, unidad: 'm2' });
    await e.tarea(e.persona, [['2026-10-06T08:00:00-03:00', '2026-10-06T10:15:00-03:00']], null);
    const r = await e.ver('desde=2026-10-05&hasta=2026-10-11');
    expect(r.items.map((i) => i.tarea_id)).toEqual([t]);
    expect(r.items[0]).toMatchObject({ segundos: 3600, cantidad: 3, unidad: 'm2', descripcion: 'zz_test tarea 1' });
    expect(r.items[0].ot_codigo).toMatch(/^OT15-/);
    expect(r.horas_periodo_segundos).toBe(3600 + 8100);
    expect(JSON.stringify(r)).not.toMatch(/_gs|tarifa|monto/);
  });

  it('CA-15.2: solo las propias', async () => {
    const e = await escenario();
    const [otra] = await admin`INSERT INTO persona (nombre, ci) VALUES (${'zz_test_otra15_' + e.tag}, ${'U15' + e.tag}) RETURNING id`;
    personas.push(otra.id as string);
    await e.tarea(otra.id as string, [['2026-10-07T08:00:00-03:00', '2026-10-07T09:00:00-03:00']], '2026-10-07T09:00:00-03:00');
    const r = await e.ver('desde=2026-10-01&hasta=2026-10-31');
    expect(r.total).toBe(0);
    expect(r.horas_periodo_segundos).toBe(0);
  });

  it('CA-15.3: filtra por la fecha de terminado en Asunción, de la más reciente a la más vieja, 25 por página', async () => {
    const e = await escenario();
    // Terminada el 12/10 a las 23:30 de Asunción (= 13/10 en UTC): cuenta para el 12.
    const tardia = await e.tarea(e.persona, [['2026-10-12T22:00:00-03:00', '2026-10-12T23:00:00-03:00']], '2026-10-12T23:30:00-03:00');
    expect((await e.ver('desde=2026-10-12&hasta=2026-10-12')).items.map((i) => i.tarea_id)).toEqual([tardia]);
    expect((await e.ver('desde=2026-10-13&hasta=2026-10-13')).total).toBe(0);
    for (let d = 1; d <= 26; d++) {
      await e.tarea(e.persona, [], `2026-09-${String(d).padStart(2, '0')}T12:00:00-03:00`);
    }
    const p1 = await e.ver('desde=2026-09-01&hasta=2026-09-30');
    expect([p1.total, p1.items.length]).toEqual([26, 25]);
    expect(p1.items[0].terminada_at > p1.items[24].terminada_at).toBe(true);
    expect((await e.ver('desde=2026-09-01&hasta=2026-09-30&pagina=2')).items.length).toBe(1);
  });

  it('rango: más de 92 días o desde > hasta → 400; sin persona vinculada → 403', async () => {
    const e = await escenario();
    expect((await e.op('GET', '/api/mi-trabajo/terminadas?desde=2026-01-01&hasta=2026-06-30')).status).toBe(400);
    expect((await e.op('GET', '/api/mi-trabajo/terminadas?desde=2026-10-10&hasta=2026-10-01')).status).toBe(400);
    expect((await (await sesion(['taller']))('GET', '/api/mi-trabajo/terminadas?desde=2026-10-01&hasta=2026-10-02')).status).toBe(403);
  });
});
