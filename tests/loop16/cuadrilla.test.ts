import { describe, it, expect, afterAll } from 'vitest';
import { admin, cerrarConexiones } from '../loop0/helpers.js';
import { sesion } from '../loop3/helpers-comercial.js';

/** Loop 16 — asistencia de la cuadrilla y marcación remota (docs/LOOP_16_ASISTENCIA_CUADRILLA_DISENO.md). */
const personas: string[] = [];
afterAll(async () => {
  await admin`UPDATE persona SET activo = false WHERE id = ANY(${personas}::uuid[])`;
  await cerrarConexiones();
});
const uuid = () => crypto.randomUUID();
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(new Date());
const FABRICA = { gpsLat: -25.320588, gpsLng: -57.624181 };
const LEJOS = { gpsLat: -25.2697, gpsLng: -57.4873 }; // Luque, a ~15 km
const disp = { dispositivoHash: 'cd'.repeat(16) };
type Resp = { marcadas: { personaId: string; id: string }[]; rechazadas: { personaId: string; motivo: string }[] };

async function persona(tag: string, caps: string[] | null) {
  const [p] = await admin`INSERT INTO persona (nombre, ci) VALUES (${'zz_test_c16_' + tag + uuid().slice(0, 4)}, ${'C16' + uuid().slice(0, 8)}) RETURNING id`;
  personas.push(p.id as string);
  if (!caps) return { id: p.id as string, s: null };
  const s = await sesion(caps);
  await admin`UPDATE usuario SET persona_id = ${p.id} WHERE id = ${s.usuarioId}`;
  return { id: p.id as string, s };
}

async function escenario(fecha = hoy()) {
  const tag = uuid().slice(0, 6);
  const coord = await sesion(['comercial']);
  await admin`INSERT INTO sede (nombre, gps_lat, gps_lng) SELECT 'zz_test Fábrica', -25.320588, -57.624181 WHERE NOT EXISTS (SELECT 1 FROM sede WHERE activo)`;
  const carlos = await persona('carlos' + tag, ['montaje']);
  const ayudantes = [await persona('a' + tag, null), await persona('b' + tag, null), await persona('c' + tag, ['montaje'])];
  const [v] = await admin`INSERT INTO vehiculo (chapa, marca_modelo) VALUES (${'Z16' + tag.toUpperCase()}, 'zz_test camión') RETURNING id`;
  const hoja = (await coord('POST', '/api/hojas-ruta', { fecha, vehiculoId: v.id })).j;
  await coord('POST', `/api/hojas-ruta/${hoja.id}/personas`, { personaId: carlos.id, rol: 'CONDUCTOR' });
  for (const a of ayudantes) await coord('POST', `/api/hojas-ruta/${hoja.id}/personas`, { personaId: a.id, rol: 'AYUDANTE' });
  const cuadrilla = (quien: typeof carlos.s, tipo: string, ids: string[], extra: Record<string, unknown> = {}) =>
    quien!('POST', '/api/asistencia/cuadrilla', { hojaRutaId: hoja.id, tipo, ...FABRICA, ...disp, personas: ids.map((personaId) => ({ personaId, claveIdempotencia: uuid() })), ...extra });
  return { coord, carlos, ayudantes, hoja: hoja.id as string, cuadrilla };
}

describe('Loop 16 — asistencia de la cuadrilla y marcación remota', () => {
  it('CA-16.1: el conductor marca la entrada de 3: CUADRILLA con quién marcó y la salida; GET muestra la cuadrilla', async () => {
    const e = await escenario();
    const r = await e.cuadrilla(e.carlos.s, 'ENTRADA', e.ayudantes.map((a) => a.id));
    expect(r.status).toBe(201);
    const j = r.j as unknown as Resp;
    expect([j.marcadas.length, j.rechazadas.length]).toEqual([3, 0]);
    const filas = await admin`SELECT origen, marcada_por, hoja_ruta_id, tipo, dentro_geocerca FROM marcacion_asistencia WHERE persona_id = ANY(${e.ayudantes.map((a) => a.id)}::uuid[])`;
    expect(filas.map((f) => [f.origen, f.marcada_por, f.hoja_ruta_id, f.tipo, f.dentro_geocerca]))
      .toEqual(Array(3).fill(['CUADRILLA', e.carlos.s!.usuarioId, e.hoja, 'ENTRADA', true]));
    const g = await e.carlos.s!('GET', '/api/asistencia/cuadrilla');
    const salida = (g.j.salidas as { hoja_ruta_id: string; personas: { persona_id: string; ultima_tipo: string | null }[] }[]).find((x) => x.hoja_ruta_id === e.hoja)!;
    expect(salida.personas.filter((p) => p.ultima_tipo === 'ENTRADA').length).toBe(3);
    expect(salida.personas.find((p) => p.persona_id === e.carlos.id)?.ultima_tipo).toBeNull();
  });

  it('CA-16.2: quien no es conductor de esa salida → 403 (un ayudante, o el conductor de otro día)', async () => {
    const e = await escenario();
    expect((await e.cuadrilla(e.ayudantes[2].s, 'ENTRADA', [e.ayudantes[0].id])).status).toBe(403);
    const ayer = await escenario('2026-01-05');
    expect((await ayer.cuadrilla(ayer.carlos.s, 'ENTRADA', [ayer.ayudantes[0].id])).status).toBe(403);
  });

  it('CA-16.3: quien ya entró queda rechazado y los demás se marcan; salida solo a quien entró; ajenos a la salida, rechazados', async () => {
    const e = await escenario();
    await e.ayudantes[2].s!('POST', '/api/asistencia/marcar', { tipo: 'ENTRADA', ...FABRICA, ...disp, claveIdempotencia: uuid() });
    const ajeno = await persona('x', null);
    const r = (await e.cuadrilla(e.carlos.s, 'ENTRADA', [...e.ayudantes.map((a) => a.id), ajeno.id])).j as unknown as Resp;
    expect(r.marcadas.map((m) => m.personaId).sort()).toEqual([e.ayudantes[0].id, e.ayudantes[1].id].sort());
    expect(r.rechazadas).toEqual(expect.arrayContaining([
      { personaId: e.ayudantes[2].id, motivo: expect.stringMatching(/ya marcó entrada/) },
      { personaId: ajeno.id, motivo: expect.stringMatching(/no está en esta salida/) },
    ]));
    const s = (await e.cuadrilla(e.carlos.s, 'SALIDA', [e.ayudantes[0].id, e.carlos.id])).j as unknown as Resp;
    expect(s.marcadas.map((m) => m.personaId)).toEqual([e.ayudantes[0].id]);
    expect(s.rechazadas).toEqual([{ personaId: e.carlos.id, motivo: expect.stringMatching(/no marcó entrada/) }]);
  });

  it('idempotencia: la misma clave por persona no duplica (reintento sin señal)', async () => {
    const e = await escenario();
    const body = { hojaRutaId: e.hoja, tipo: 'ENTRADA', ...FABRICA, ...disp, personas: [{ personaId: e.ayudantes[0].id, claveIdempotencia: uuid() }] };
    expect((await e.carlos.s!('POST', '/api/asistencia/cuadrilla', body)).status).toBe(201);
    const otra = await e.carlos.s!('POST', '/api/asistencia/cuadrilla', body);
    expect([otra.status, (otra.j as unknown as Resp).rechazadas.length]).toEqual([200, 0]);
    const [{ n }] = await admin`SELECT count(*)::int AS n FROM marcacion_asistencia WHERE persona_id = ${e.ayudantes[0].id}`;
    expect(n).toBe(1);
  });

  it('CA-16.4: fuera de zona sin motivo → 400 FUERA_DE_ZONA; con motivo → REMOTO; sin señal no se rechaza', async () => {
    const e = await escenario();
    const op = e.ayudantes[2].s!;
    const clave = uuid();
    const sin = await op('POST', '/api/asistencia/marcar', { tipo: 'ENTRADA', ...LEJOS, ...disp, claveIdempotencia: clave });
    expect([sin.status, sin.j.codigo]).toEqual([400, 'FUERA_DE_ZONA']);
    const con = await op('POST', '/api/asistencia/marcar', { tipo: 'ENTRADA', ...LEJOS, ...disp, claveIdempotencia: clave, motivoRemoto: 'Salí desde casa con el camión' });
    expect(con.status).toBe(201);
    const [m] = await admin`SELECT origen, motivo_remoto, dentro_geocerca FROM marcacion_asistencia WHERE id = ${con.j.id as string}`;
    expect([m.origen, m.motivo_remoto, m.dentro_geocerca]).toEqual(['REMOTO', 'Salí desde casa con el camión', false]);
    const offline = await op('POST', '/api/asistencia/marcar', { tipo: 'SALIDA', ...LEJOS, ...disp, claveIdempotencia: uuid(), ocurridaAt: new Date().toISOString() });
    expect(offline.status).toBe(201);
    const [o] = await admin`SELECT origen, sin_senal FROM marcacion_asistencia WHERE id = ${offline.j.id as string}`;
    expect([o.origen, o.sin_senal]).toEqual(['PROPIA', true]);
    // La cuadrilla también: fuera de zona pide motivo y lo guarda en cada una.
    const c1 = await e.cuadrilla(e.carlos.s, 'ENTRADA', [e.ayudantes[0].id], { ...LEJOS });
    expect([c1.status, c1.j.codigo]).toEqual([400, 'FUERA_DE_ZONA']);
    const c2 = await e.cuadrilla(e.carlos.s, 'ENTRADA', [e.ayudantes[0].id], { ...LEJOS, motivoRemoto: 'Fuimos directo al local' });
    expect(c2.status).toBe(201);
    const [q] = await admin`SELECT origen, motivo_remoto FROM marcacion_asistencia WHERE persona_id = ${e.ayudantes[0].id}`;
    expect([q.origen, q.motivo_remoto]).toEqual(['CUADRILLA', 'Fuimos directo al local']);
  });

  it('CA-16.5: siguen inmutables y la base exige los datos de cada origen', async () => {
    const e = await escenario();
    const r = (await e.cuadrilla(e.carlos.s, 'ENTRADA', [e.ayudantes[0].id])).j as unknown as Resp;
    await expect(admin`UPDATE marcacion_asistencia SET motivo_remoto = 'x' WHERE id = ${r.marcadas[0].id}`).rejects.toThrow();
    await expect(admin`DELETE FROM marcacion_asistencia WHERE id = ${r.marcadas[0].id}`).rejects.toThrow();
    const base = { persona: e.ayudantes[1].id, h: 'ab'.repeat(16) };
    await expect(admin`INSERT INTO marcacion_asistencia (persona_id, tipo, gps_lat, gps_lng, dentro_geocerca, dispositivo_hash, clave_idempotencia, origen)
      VALUES (${base.persona}, 'ENTRADA', -25.3, -57.6, false, ${base.h}, ${uuid()}, 'REMOTO')`).rejects.toThrow(/check/i);
    await expect(admin`INSERT INTO marcacion_asistencia (persona_id, tipo, gps_lat, gps_lng, dentro_geocerca, dispositivo_hash, clave_idempotencia, origen)
      VALUES (${base.persona}, 'ENTRADA', -25.3, -57.6, false, ${base.h}, ${uuid()}, 'CUADRILLA')`).rejects.toThrow(/check/i);
  });

  it('RR.HH. ve el origen, quién marcó y el motivo', async () => {
    const e = await escenario();
    await e.cuadrilla(e.carlos.s, 'ENTRADA', [e.ayudantes[0].id]);
    const rrhh = await sesion(['rrhh']);
    const l = (await rrhh('GET', `/api/asistencia?personaId=${e.ayudantes[0].id}`)).j as { items: { origen: string; marcada_por_nombre: string | null; motivo_remoto: string | null }[] };
    expect(l.items[0]).toMatchObject({ origen: 'CUADRILLA', motivo_remoto: null });
    expect(l.items[0].marcada_por_nombre).toMatch(/zz_test_c16_carlos/);
  });
});
