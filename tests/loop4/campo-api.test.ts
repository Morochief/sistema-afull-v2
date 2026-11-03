import { describe, it, expect, afterAll } from 'vitest';
import { admin, api as apiDb, cerrarConexiones } from '../loop0/helpers.js';
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

describe('Loop 4 — campo y flota', () => {
  it('"hoy" muestra la hoja; iniciar viaje es idempotente y pasa la hoja a EN_CURSO (CA-4.2)', async () => {
    const e = await escenario();
    const hoy = (await e.op('GET', '/api/campo/hoy')).j;
    expect((hoy.hojas as unknown[]).length).toBe(1);
    // L5: la parada trae el id de la OT para poder cargar material desde la calle.
    expect((hoy.hojas as { paradas: { orden_trabajo_id: string }[] }[])[0].paradas[0].orden_trabajo_id).toBe(e.ot);
    const clave = uuid();
    const a = await e.op('POST', '/api/campo/viajes/iniciar', { vehiculoId: e.vehiculo, hojaRutaId: e.hoja, kmInicio: 1000, claveIdempotencia: clave });
    const b = await e.op('POST', '/api/campo/viajes/iniciar', { vehiculoId: e.vehiculo, hojaRutaId: e.hoja, kmInicio: 1000, claveIdempotencia: clave });
    expect([a.status, b.status]).toEqual([201, 200]);
    expect(b.j.id).toBe(a.j.id);
    const [h] = await admin`SELECT estado FROM hoja_ruta WHERE id = ${e.hoja}`;
    expect(h.estado).toBe('EN_CURSO');
  });

  it('CA-4.1: dos viajes abiertos del mismo vehículo → 409 (también en paralelo)', async () => {
    const e = await escenario();
    const r = await Promise.all([
      e.op('POST', '/api/campo/viajes/iniciar', { vehiculoId: e.vehiculo, kmInicio: 10, claveIdempotencia: uuid() }),
      e.op('POST', '/api/campo/viajes/iniciar', { vehiculoId: e.vehiculo, kmInicio: 10, claveIdempotencia: uuid() }),
    ]);
    expect(r.map((x) => x.status).sort()).toEqual([201, 409]);
  });

  it('CA-4.5: +50 % sobre lo estimado pide motivo y cierra igual con alerta; el viaje cerrado no se reabre (CA-4.3)', async () => {
    const e = await escenario();
    const v = (await e.op('POST', '/api/campo/viajes/iniciar', { vehiculoId: e.vehiculo, hojaRutaId: e.hoja, kmInicio: 5000, claveIdempotencia: uuid() })).j;
    expect((await e.op('POST', `/api/campo/viajes/${v.id}/cerrar`, { kmFin: 4999, claveIdempotencia: uuid() })).status).toBe(400);
    const sin = await e.op('POST', `/api/campo/viajes/${v.id}/cerrar`, { kmFin: 5100, claveIdempotencia: uuid() });
    expect(sin.status).toBe(400);
    expect(String(sin.j.error)).toMatch(/estimados/);
    const clave = uuid();
    const ok = await e.op('POST', `/api/campo/viajes/${v.id}/cerrar`, { kmFin: 5100, motivoDesvio: 'Ferretería por tornillos', claveIdempotencia: clave });
    expect(ok.status).toBe(200);
    expect(ok.j.alerta_desvio).toBe(true);
    expect((await e.op('POST', `/api/campo/viajes/${v.id}/cerrar`, { kmFin: 5100, claveIdempotencia: clave })).j.repetido).toBe(true);
    await expect(apiDb`UPDATE viaje SET km_fin = 6000 WHERE id = ${v.id as string}`).rejects.toMatchObject({ code: '23514' });
    await expect(apiDb`DELETE FROM viaje WHERE id = ${v.id as string}`).rejects.toBeTruthy();
    const otro = await e.op('POST', '/api/campo/viajes/iniciar', { vehiculoId: e.vehiculo, kmInicio: 5050, claveIdempotencia: uuid() });
    expect(otro.status).toBe(400); // menos km que el último cierre, sin motivo
  });

  it('CA-4.6: omitir sin motivo → 400; completar la última parada finaliza la hoja', async () => {
    const e = await escenario();
    expect((await e.op('POST', `/api/campo/paradas/${e.parada}/omitir`, { motivo: '' })).status).toBe(400);
    const r = await e.op('POST', `/api/campo/paradas/${e.parada}/completar`);
    expect(r.j.hoja_finalizada).toBe(true);
    expect((await e.op('POST', `/api/campo/paradas/${e.parada}/completar`)).j.repetida).toBe(true);
    await expect(admin`UPDATE hoja_ruta_parada SET estado = 'OMITIDA' WHERE id = ${e.parada}`).rejects.toMatchObject({ code: '23514' });
  });

  it('CA-4.4: marcación fuera de geocerca se guarda igual; reintento no duplica; tabla inmutable', async () => {
    const e = await escenario();
    const clave = uuid();
    const datos = { tipo: 'ENTRADA', gpsLat: -25.33, gpsLng: -57.63, dispositivoHash: 'a1b2c3d4e5f60718', claveIdempotencia: clave };
    const a = await e.op('POST', '/api/asistencia/marcar', datos);
    expect(a.status).toBe(201);
    expect(a.j.dentro_geocerca).toBe(false);
    expect(Number(a.j.distancia_m)).toBeGreaterThan(100);
    expect((await e.op('POST', '/api/asistencia/marcar', datos)).status).toBe(200);
    const [{ n }] = await admin`SELECT count(*)::int AS n FROM marcacion_asistencia WHERE clave_idempotencia = ${clave}`;
    expect(n).toBe(1);
    await expect(apiDb`UPDATE marcacion_asistencia SET dentro_geocerca = true WHERE clave_idempotencia = ${clave}`).rejects.toBeTruthy();
    expect((await e.op('GET', '/api/asistencia')).status).toBe(403);
    expect((await (await sesion(['rrhh']))('GET', '/api/asistencia?soloFuera=true')).status).toBe(200);
  });

  it('permisos: coordinación sin montaje → 403 en campo; vehículos solo los crea admin', async () => {
    const e = await escenario();
    expect((await e.coord('GET', '/api/campo/hoy')).status).toBe(403);
    expect((await e.coord('POST', '/api/flota/vehiculos', { chapa: 'zz1', marcaModelo: 'x' })).status).toBe(403);
    expect((await e.op('POST', '/api/hojas-ruta', { fecha: '2026-11-03' })).status).toBe(403);
  });
});
