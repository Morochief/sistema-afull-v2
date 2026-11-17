import { describe, it, expect, afterAll, vi } from 'vitest';
import { admin, cerrarConexiones } from '../loop0/helpers.js';
import { sesion } from '../loop3/helpers-comercial.js';

/** Loop 14 — panel de Gerardo: quién está y en qué (docs/LOOP_14_PANEL_GERARDO_DISENO.md). */
const eventos: string[] = [];
vi.mock('../../apps/api/src/modules/live/publicar.js', () => ({
  publicarLive: async (tipo: string) => { eventos.push(tipo); },
}));

const personas: string[] = [];
afterAll(async () => {
  await admin`UPDATE tarea_intervalo SET hora_fin = greatest(clock_timestamp(), hora_inicio), motivo_cierre = 'FIN'
              WHERE hora_fin IS NULL AND persona_id = ANY(${personas}::uuid[])`;
  await admin`UPDATE persona SET activo = false WHERE id = ANY(${personas}::uuid[])`;
  await cerrarConexiones();
});
const uuid = () => crypto.randomUUID();
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(new Date());
type Item = { persona_id: string; nombre: string; [k: string]: unknown };
type Panel = { trabajando: Item[]; en_pausa: Item[]; sin_tarea: Item[]; sin_marcar: Item[] };

async function operario(caps = ['taller']) {
  const tag = uuid().slice(0, 8);
  const s = await sesion(caps);
  const [p] = await admin`INSERT INTO persona (nombre, ci) VALUES (${'zz_test_op14_' + tag}, ${'P14' + tag}) RETURNING id`;
  personas.push(p.id as string);
  await admin`UPDATE usuario SET persona_id = ${p.id} WHERE id = ${s.usuarioId}`;
  const marcar = (tipo: 'ENTRADA' | 'SALIDA') => admin`
    INSERT INTO marcacion_asistencia (persona_id, tipo, gps_lat, gps_lng, dentro_geocerca, dispositivo_hash, clave_idempotencia)
    VALUES (${p.id}, ${tipo}, -25.3, -57.6, true, ${'ab'.repeat(16)}, ${uuid()})`;
  return { s, persona: p.id as string, tag, marcar };
}
async function ot(gerardo: Awaited<ReturnType<typeof sesion>>, hoja = 'ACTIVA') {
  const tag = uuid().slice(0, 8);
  const [c] = await admin`INSERT INTO cliente (codigo, nombre) VALUES (${'Z14' + tag}, ${'zz_test_cli14_' + tag}) RETURNING id`;
  const [o] = await admin`INSERT INTO orden_trabajo (codigo_ot, cliente_id, titulo, creado_por, hoja_estado)
                          VALUES (${'OT14-' + tag}, ${c.id}, 'zz_test caseta', ${gerardo.usuarioId}, ${hoja}) RETURNING id`;
  return o.id as string;
}
async function tarea(otId: string, persona: string, creador: string) {
  const [t] = await admin`INSERT INTO tarea (orden_trabajo_id, persona_asignada_id, tipo, descripcion, orden_secuencia, creado_por)
                          VALUES (${otId}, ${persona}, 'TALLER_IMPRESION', 'zz_test imprimir', 1, ${creador}) RETURNING id`;
  return t.id as string;
}
const leer = async (g: Awaited<ReturnType<typeof sesion>>) => {
  const r = await g('GET', '/api/panel');
  expect(r.status).toBe(200);
  return r.j as unknown as Panel;
};
const donde = (p: Panel, persona: string) =>
  (['trabajando', 'en_pausa', 'sin_tarea', 'sin_marcar'] as const).filter((k) => p[k].some((x) => x.persona_id === persona));

describe('Loop 14 — panel de Gerardo', () => {
  it('CA-14.1/14.4: sin marcar → marcó entrada (sin tarea, con 0 pendientes) → inicia → Trabajando con la OT', async () => {
    const g = await sesion(['comercial']);
    const op = await operario();
    expect(donde(await leer(g), op.persona)).toEqual(['sin_marcar']);
    await op.marcar('ENTRADA');
    let p = await leer(g);
    expect(donde(p, op.persona)).toEqual(['sin_tarea']);
    expect(p.sin_tarea.find((x) => x.persona_id === op.persona)?.pendientes_hoy).toBe(0);
    const t = await tarea(await ot(g), op.persona, g.usuarioId);
    expect((await leer(g)).sin_tarea.find((x) => x.persona_id === op.persona)?.pendientes_hoy).toBe(1);
    expect((await op.s('POST', `/api/mi-trabajo/tareas/${t}/iniciar`, { claveIdempotencia: uuid() })).status).toBe(201);
    p = await leer(g);
    expect(donde(p, op.persona)).toEqual(['trabajando']);
    const w = p.trabajando.find((x) => x.persona_id === op.persona) as Item & { ot_codigo: string; desde: string; salio: boolean };
    expect(w.ot_codigo).toMatch(/^OT14-/);
    expect(w.salio).toBe(false);
    expect(Date.parse(w.desde)).toBeGreaterThan(Date.now() - 60_000);
  });

  it('CA-14.3: pausada aparece en "En pausa" con el motivo y la hora', async () => {
    const g = await sesion(['comercial']);
    const op = await operario();
    await op.marcar('ENTRADA');
    const t = await tarea(await ot(g), op.persona, g.usuarioId);
    await op.s('POST', `/api/mi-trabajo/tareas/${t}/iniciar`, { claveIdempotencia: uuid() });
    expect((await op.s('POST', `/api/mi-trabajo/tareas/${t}/pausar`, { motivo: 'ALMUERZO', claveIdempotencia: uuid() })).status).toBe(200);
    const p = await leer(g);
    expect(donde(p, op.persona)).toEqual(['en_pausa']);
    const x = p.en_pausa.find((i) => i.persona_id === op.persona)!;
    expect([x.motivo, x.tarea_descripcion]).toEqual(['ALMUERZO', 'zz_test imprimir']);
  });

  it('CA-14.2: con salida y sin reloj no aparece; con salida y reloj abierto, Trabajando con aviso', async () => {
    const g = await sesion(['comercial']);
    const a = await operario();
    await a.marcar('ENTRADA');
    await a.marcar('SALIDA');
    expect(donde(await leer(g), a.persona)).toEqual([]);
    const b = await operario(['montaje']);
    await b.marcar('ENTRADA');
    const t = await tarea(await ot(g), b.persona, g.usuarioId);
    await b.s('POST', `/api/mi-trabajo/tareas/${t}/iniciar`, { claveIdempotencia: uuid() });
    await b.marcar('SALIDA');
    const p = await leer(g);
    expect(donde(p, b.persona)).toEqual(['trabajando']);
    expect(p.trabajando.find((x) => x.persona_id === b.persona)?.salio).toBe(true);
  });

  it('CA-14.4: "No marcaron entrada" solo personas activas con usuario operativo', async () => {
    const g = await sesion(['comercial']);
    const oficina = await operario(['comercial']);
    const inactivo = await operario();
    await admin`UPDATE persona SET activo = false WHERE id = ${inactivo.persona}`;
    const p = await leer(g);
    expect(donde(p, oficina.persona)).toEqual([]);
    expect(donde(p, inactivo.persona)).toEqual([]);
  });

  it('CA-14.5: asignar desde el panel con la hoja en borrador y activarla → el operario la ve, con eventos en vivo', async () => {
    const g = await sesion(['comercial']);
    const op = await operario();
    await op.marcar('ENTRADA');
    const otId = await ot(g, 'BORRADOR');
    eventos.length = 0;
    const r = await g('POST', `/api/comercial/ot/${otId}/tareas`, {
      tipo: 'TALLER_IMPRESION', descripcion: 'zz_test lona urgente', personaAsignadaId: op.persona, fechaTrabajo: hoy(), minutosEstimados: 30,
    });
    expect(r.status).toBe(201);
    const ve = async () => ((await op.s('GET', '/api/mi-trabajo')).j.tareas as { descripcion: string }[]).some((t) => t.descripcion === 'zz_test lona urgente');
    expect(await ve()).toBe(false);
    expect((await g('POST', `/api/comercial/ot/${otId}/hoja`, { accion: 'ACTIVAR', desde: 'BORRADOR' })).status).toBe(200);
    expect(await ve()).toBe(true);
    expect((await leer(g)).sin_tarea.find((x) => x.persona_id === op.persona)?.pendientes_hoy).toBe(1);
    expect(eventos).toEqual(expect.arrayContaining(['tarea.crear', 'ot.hoja']));
  });

  it('CA-14.6: taller y montaje → 403; la respuesta no trae montos', async () => {
    for (const cap of ['taller', 'montaje']) expect((await (await sesion([cap]))('GET', '/api/panel')).status).toBe(403);
    expect((await (await sesion([]))('GET', '/api/panel')).status).toBe(403);
    const texto = JSON.stringify(await leer(await sesion(['comercial'])));
    expect(texto).not.toMatch(/_gs|tarifa|monto/);
  });
});
