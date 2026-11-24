import { describe, it, expect, afterAll } from 'vitest';
import { admin, api as apiDb, cerrarConexiones } from '../loop0/helpers.js';
import { crearUsuario, post } from '../loop0/auth-helpers.js';
import { sesion } from '../loop3/helpers-comercial.js';
import { app } from '../../apps/api/src/index.js';

/** Loop 22 — áreas de trabajo y procesos de aFull (docs/LOOP_22_AREAS_DISENO.md). */
const personas: string[] = [];
const procesosCreados: string[] = [];
afterAll(async () => {
  await admin`UPDATE tarea_intervalo SET hora_fin = greatest(clock_timestamp(), hora_inicio), motivo_cierre = 'FIN'
              WHERE hora_fin IS NULL AND persona_id = ANY(${personas}::uuid[])`;
  await admin`UPDATE persona SET activo = false WHERE id = ANY(${personas}::uuid[])`;
  await admin`UPDATE tipo_tarea SET activo = false WHERE codigo = ANY(${procesosCreados}::text[])`;
  await cerrarConexiones();
});

const ORIGEN = process.env.APP_ORIGIN || 'http://localhost:3000';
const req = (method: string, path: string, cookie: string, body?: unknown) =>
  app.request(path, { method, headers: { origin: ORIGEN, cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
const login = async (caps: string[]) => {
  const u = await crearUsuario(caps);
  const res = await post('/api/auth/login', { username: u.username, password: 'Password123!' });
  return { id: u.id as string, cookie: res.headers.get('set-cookie')!.split(';')[0] };
};
type Proceso = { codigo: string; nombre: string; area: string; activo: boolean; con_medidas: boolean };

/** Edu con tarifa 36.000 Gs/h, un cliente con una OT y tareas del tipo que se pida. */
async function escenario() {
  const tag = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const edu = await login(['taller']);
  const [p] = await admin`INSERT INTO persona (nombre, ci) VALUES (${'zz_test_area_' + tag}, ${'A22' + tag}) RETURNING id`;
  personas.push(p.id as string);
  await admin`UPDATE usuario SET persona_id = ${p.id} WHERE id = ${edu.id}`;
  await admin`INSERT INTO tarifa_persona (persona_id, tarifa_hora_gs, fecha_inicio) VALUES (${p.id}, 36000, '2026-01-01')`;
  const [c] = await admin`INSERT INTO cliente (codigo, nombre) VALUES (${'C22-' + tag}, ${'zz_test_cli22_' + tag}) RETURNING id`;
  const nuevaOt = async (k: string) => (await admin`
    INSERT INTO orden_trabajo (codigo_ot, cliente_id, titulo, creado_por) VALUES (${`OT22${k}-${tag}`}, ${c.id}, ${'zz_test areas ' + k}, ${edu.id})
    RETURNING id`)[0].id as string;
  const tarea = async (otId: string, tipo: string) => (await admin`
    INSERT INTO tarea (orden_trabajo_id, persona_asignada_id, tipo, descripcion, orden_secuencia, estado, creado_por)
    VALUES (${otId}, ${p.id}, ${tipo}, ${'zz_test ' + tipo}, 1, 'PENDIENTE', ${edu.id}) RETURNING id`)[0].id as string;
  const tramo = (t: string, ini: string, fin: string) => admin`
    INSERT INTO tarea_intervalo (tarea_id, persona_id, hora_inicio, hora_fin, motivo_cierre, clave_idempotencia)
    VALUES (${t}, ${p.id}, ${ini}, ${fin}, 'FIN', ${crypto.randomUUID()})`;
  return { tag, edu, personaId: p.id as string, clienteId: c.id as string, nuevaOt, tarea, tramo };
}

describe('Loop 22 — áreas de trabajo', () => {
  it('CA-22.1: el catálogo tiene las áreas y procesos de aFull, y la base no acepta áreas desconocidas', async () => {
    const sofi = await sesion(['comercial']);
    const lista = (await sofi('GET', '/api/procesos')).j as unknown as Proceso[];
    const de = (area: string) => lista.filter((p) => p.area === area && p.activo).map((p) => p.nombre);
    expect(de('TERMINACIONES')).toEqual(expect.arrayContaining(['Ploteo', 'Ploteo y lijado', 'Colocación de LEDs', 'Corte adhesivo', 'Refilado', 'Carga de móvil', 'Relevamiento', 'Enfilado', 'Preparación de materiales', 'Limpieza']));
    expect(de('CARPINTERIA')).toEqual(expect.arrayContaining(['Corte MDF', 'Lijado', 'Fabricación', 'Despiece de materiales']));
    expect(de('PINTURA')).toEqual(expect.arrayContaining(['Colocación de enduido', 'Colocación de enduido y lijado', 'Lijado', 'Proceso de pintura']));
    expect(de('IMPRESIONES')).toEqual(expect.arrayContaining(['Impresión', 'Montaje de impresión']));
    expect(de('HERRERIA')).toEqual(expect.arrayContaining(['Fabricación', 'Despiece de materiales', 'Limpieza de caños']));
    expect(de('LOGISTICA')).toEqual(expect.arrayContaining(['Retiro de materiales', 'Cobranza', 'Entrega de recibo', 'Entrega de materiales']));
    expect(de('DISENO')).toEqual(expect.arrayContaining(['Diseño', 'Informe', 'Redes sociales', 'Preparación de originales', 'Medición']));
    expect(de('MONTAJE')).toEqual(expect.arrayContaining(['Montaje / colocación']));
    expect(lista.find((p) => p.codigo === 'CARPINTERIA')?.activo).toBe(false);
    const juan = await sesion(['admin']);
    expect((await juan('POST', '/api/procesos', { nombre: 'zz no', area: 'TALLER' })).status).toBe(400);
    await expect(admin`INSERT INTO tipo_tarea (codigo, nombre, area) VALUES ('ZZ_AREA_MALA', 'zz', 'TALLER')`).rejects.toMatchObject({ code: '23514' });
  });

  it('CA-22.2: el mismo nombre en otra área lleva el área en el código; en la misma área es 409', async () => {
    const juan = await sesion(['admin']);
    const nombre = 'Zz lijado ' + crypto.randomUUID().slice(0, 6);
    const a = await juan('POST', '/api/procesos', { nombre, area: 'CARPINTERIA' });
    expect(a.status).toBe(201);
    const b = await juan('POST', '/api/procesos', { nombre, area: 'HERRERIA' });
    expect(b.status).toBe(201);
    procesosCreados.push(String(a.j.codigo), String(b.j.codigo));
    expect(String(b.j.codigo)).toBe(`${a.j.codigo}_HERRERIA`);
    expect((await juan('POST', '/api/procesos', { nombre: nombre.toUpperCase(), area: 'HERRERIA' })).status).toBe(409);
  });

  it('CA-22.3: "Medidas en cm" es una marca del proceso: Corte MDF la tiene, Mi trabajo la informa y la tanda la exige', async () => {
    const e = await escenario();
    const juan = await sesion(['admin']);
    const lista = (await juan('GET', '/api/procesos')).j as unknown as Proceso[];
    expect(lista.find((p) => p.codigo === 'CORTE_MDF')?.con_medidas).toBe(true);
    expect(lista.find((p) => p.codigo === 'LIJADO')?.con_medidas).toBe(false);
    const ot1 = await e.nuevaOt('A');
    const ot2 = await e.nuevaOt('B');
    const mdf = await e.tarea(ot1, 'CORTE_MDF');
    const imp = await e.tarea(ot2, 'TALLER_IMPRESION');
    const lij = await e.tarea(ot2, 'LIJADO');
    const mt = await (await req('GET', '/api/mi-trabajo', e.edu.cookie)).json() as { tareas: { id: string; con_medidas: boolean }[] };
    expect(mt.tareas.find((t) => t.id === mdf)?.con_medidas).toBe(true);
    expect(mt.tareas.find((t) => t.id === lij)?.con_medidas).toBe(false);
    const tanda = (ids: string[]) => req('POST', '/api/mi-trabajo/tanda', e.edu.cookie,
      { tareas: ids.map((tareaId) => ({ tareaId, m2Piezas: 1 })), claveIdempotencia: crypto.randomUUID() });
    expect((await tanda([mdf, lij])).status).toBe(400);
    expect((await tanda([mdf, imp])).status).toBe(201);
    // Admin la puede prender en otro proceso.
    const nombre = 'Zz fresado ' + crypto.randomUUID().slice(0, 6);
    const p = await juan('POST', '/api/procesos', { nombre, area: 'CARPINTERIA', conMedidas: true });
    procesosCreados.push(String(p.j.codigo));
    expect(p.j.con_medidas).toBe(true);
    expect((await juan('PATCH', `/api/procesos/${p.j.codigo}`, { conMedidas: false })).j.con_medidas).toBe(false);
  });

  it('CA-22.4 y CA-22.5: el costo de la OT y el reporte separan las horas por área', async () => {
    const e = await escenario();
    const ot = await e.nuevaOt('C');
    await e.tramo(await e.tarea(ot, 'LIJADO'), '2026-09-15T08:00:00-03:00', '2026-09-15T09:00:00-03:00');
    await e.tramo(await e.tarea(ot, 'PINTURA'), '2026-09-15T09:00:00-03:00', '2026-09-15T09:30:00-03:00');
    const sofi = await sesion(['comercial']);
    const costo = (await sofi('GET', `/api/costeo/ot/${ot}`)).j as unknown as { horas: number; areas: { area: string; nombre: string; horas: number; costo_gs: number }[] };
    expect(costo.areas).toEqual([
      { area: 'CARPINTERIA', nombre: 'Carpintería', horas: 1, costo_gs: 36000 },
      { area: 'PINTURA', nombre: 'Pintura', horas: 0.5, costo_gs: 18000 },
    ]);
    expect(costo.areas.reduce((a, x) => a + x.horas, 0)).toBe(costo.horas);

    const r = await sofi('GET', `/api/reportes/areas?desde=2026-09-15&hasta=2026-09-15&clienteId=${e.clienteId}`);
    expect(r.status).toBe(200);
    const rep = r.j as unknown as { areas: { codigo: string; nombre: string; segundos: number }[]; filas: { ot_id: string; por_area: Record<string, number>; segundos: number }[] };
    expect(rep.areas).toEqual([{ codigo: 'CARPINTERIA', nombre: 'Carpintería', segundos: 3600 }, { codigo: 'PINTURA', nombre: 'Pintura', segundos: 1800 }]);
    expect(rep.filas).toHaveLength(1);
    expect(rep.filas[0]).toMatchObject({ ot_id: ot, por_area: { CARPINTERIA: 3600, PINTURA: 1800 }, segundos: 5400 });
    expect((await req('GET', '/api/reportes/areas?desde=2026-09-15&hasta=2026-09-15', e.edu.cookie)).status).toBe(403);
    const xlsx = await sofi('GET', `/api/reportes/areas.xlsx?desde=2026-09-15&hasta=2026-09-15&clienteId=${e.clienteId}`);
    expect(xlsx.status).toBe(200);
  });

  it('la API no puede borrar procesos ni cambiar el área a una que no existe', async () => {
    await expect(apiDb`DELETE FROM tipo_tarea WHERE codigo = ${'OTRO'}`).rejects.toThrow(/permission denied/);
    await expect(apiDb`UPDATE tipo_tarea SET area = ${'TALLER'} WHERE codigo = ${'OTRO'}`).rejects.toMatchObject({ code: '23514' });
  });
});
