import { describe, it, expect, afterAll } from 'vitest';
import { admin, cerrarConexiones } from '../loop0/helpers.js';
import { sesion } from '../loop3/helpers-comercial.js';

const personas: string[] = [];
afterAll(async () => {
  await admin`UPDATE viaje SET km_fin = km_inicio, hora_fin = greatest(clock_timestamp(), hora_inicio) WHERE km_fin IS NULL AND conductor_persona_id = ANY(${personas}::uuid[])`;
  await admin`UPDATE persona SET activo = false WHERE id = ANY(${personas}::uuid[])`;
  await cerrarConexiones();
});

const uuid = () => crypto.randomUUID();

/** Operario de montaje con persona vinculada + vehículo + hoja de hoy con 1 parada en Luque. */
async function escenario() {
  const tag = uuid().slice(0, 8);
  const coord = await sesion(['comercial']);
  const op = await sesion(['montaje']);
  const [p] = await admin`INSERT INTO persona (nombre, ci) VALUES (${'zz_test_cuadrilla_' + tag}, ${'CI-' + tag}) RETURNING id`;
  personas.push(p.id);
  await admin`UPDATE usuario SET persona_id = ${p.id} WHERE id = ${op.usuarioId}`;
  const [v] = await admin`INSERT INTO vehiculo (chapa, marca_modelo) VALUES (${'ZZ' + tag.toUpperCase()}, 'Hilux zz_test') RETURNING id`;
  await admin`INSERT INTO sede (nombre, gps_lat, gps_lng) SELECT 'zz_test Fábrica', -25.320588, -57.624181 WHERE NOT EXISTS (SELECT 1 FROM sede WHERE activo)`;
  const [c] = await admin`INSERT INTO cliente (codigo, nombre) VALUES (${'ZC' + tag}, ${'zz_test_cli4_' + tag}) RETURNING id`;
  const [s] = await admin`INSERT INTO sucursal (cliente_id, nombre, gps_lat, gps_lng) VALUES (${c.id}, 'Luque', -25.2697, -57.4873) RETURNING id`;
  const ot = (await coord('POST', '/api/comercial/ot', { clienteId: c.id, sucursalId: s.id, titulo: 'zz_test montaje' })).j;
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(new Date());
  const hoja = (await coord('POST', '/api/hojas-ruta', { fecha: hoy, vehiculoId: v.id })).j;
  await coord('POST', `/api/hojas-ruta/${hoja.id}/personas`, { personaId: p.id, rol: 'CONDUCTOR' });
  const parada = (await coord('POST', `/api/hojas-ruta/${hoja.id}/paradas`, { ordenTrabajoId: ot.id })).j;
  return { coord, op, persona: p.id as string, vehiculo: v.id as string, hoja: hoja.id as string, parada: parada.id as string, ot: ot.id as string };
}

const hace = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const gps = { gpsLat: -25.320588, gpsLng: -57.624181, dispositivoHash: 'ab'.repeat(16) };

describe('Loop 4 (L4.E4) — acciones cargadas sin señal', () => {
  it('se guardan con la hora real del celular y quedan marcadas "sin señal"; sin hora, como siempre (CA-4.7)', async () => {
    const e = await escenario();
    const entrada = await e.op('POST', '/api/asistencia/marcar', { tipo: 'ENTRADA', ...gps, claveIdempotencia: uuid(), ocurridaAt: hace(45) });
    expect(entrada.status).toBe(201);
    const [m] = await admin`SELECT sin_senal, extract(epoch FROM recibida_at - marcada_at)::int AS atraso FROM marcacion_asistencia WHERE id = ${entrada.j.id as string}`;
    expect(m.sin_senal).toBe(true);
    expect(m.atraso).toBeGreaterThanOrEqual(45 * 60 - 5);
    const salida = await e.op('POST', '/api/asistencia/marcar', { tipo: 'SALIDA', ...gps, claveIdempotencia: uuid() });
    const [s] = await admin`SELECT sin_senal FROM marcacion_asistencia WHERE id = ${salida.j.id as string}`;
    expect(s.sin_senal).toBe(false);

    const v = await e.op('POST', '/api/campo/viajes/iniciar', { vehiculoId: e.vehiculo, hojaRutaId: e.hoja, kmInicio: 500, claveIdempotencia: uuid(), ocurridaAt: hace(40) });
    expect((await e.op('POST', `/api/campo/paradas/${e.parada}/completar`, { ocurridaAt: hace(20) })).status).toBe(200);
    const cierre = await e.op('POST', `/api/campo/viajes/${v.j.id as string}/cerrar`, { kmFin: 530, motivoDesvio: 'zz_test', claveIdempotencia: uuid(), ocurridaAt: hace(5) });
    expect(cierre.status).toBe(200);
    const [vi] = await admin`
      SELECT inicio_sin_senal, cierre_sin_senal, extract(epoch FROM hora_fin - hora_inicio)::int AS duracion FROM viaje WHERE id = ${v.j.id as string}
    `;
    expect([vi.inicio_sin_senal, vi.cierre_sin_senal]).toEqual([true, true]);
    expect(Math.abs(vi.duracion - 35 * 60)).toBeLessThan(5);
    const [pa] = await admin`SELECT cierre_sin_senal, extract(epoch FROM now() - completada_at)::int AS hace FROM hoja_ruta_parada WHERE id = ${e.parada}`;
    expect(pa.cierre_sin_senal).toBe(true);
    expect(Math.abs(pa.hace - 20 * 60)).toBeLessThan(10);
    // RR.HH. lo ve marcado.
    const rrhh = await sesion(['rrhh']);
    const lista = (await rrhh('GET', `/api/asistencia?personaId=${e.persona}`)).j as { items: { sin_senal: boolean }[] };
    expect(lista.items.map((x) => x.sin_senal).sort()).toEqual([false, true]);
  });

  it('límites: más de 72 h atrás o reloj adelantado → 400 con un mensaje claro', async () => {
    const e = await escenario();
    const viejo = await e.op('POST', '/api/asistencia/marcar', { tipo: 'ENTRADA', ...gps, claveIdempotencia: uuid(), ocurridaAt: hace(73 * 60) });
    expect([viejo.status, viejo.j.error]).toEqual([400, expect.stringMatching(/más de 3 días/)]);
    const futuro = await e.op('POST', '/api/asistencia/marcar', { tipo: 'ENTRADA', ...gps, claveIdempotencia: uuid(), ocurridaAt: hace(-10) });
    expect([futuro.status, futuro.j.error]).toEqual([400, expect.stringMatching(/adelantada/)]);
    expect((await e.op('POST', '/api/asistencia/marcar', { tipo: 'ENTRADA', ...gps, claveIdempotencia: uuid(), ocurridaAt: 'ayer' })).status).toBe(400);
  });
});
