import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { admin, api as apiDb, cerrarConexiones } from '../loop0/helpers.js';
import { sesion } from '../loop3/helpers-comercial.js';
import { AlmacenamientoMemoria, usarAlmacenamiento } from '../../apps/api/src/lib/almacenamiento.js';

/** L4.E3 — fotos y archivos (CA-4.7): odómetro, evidencias de parada, tamaño, inmutabilidad. */
const personas: string[] = [];
let alm: AlmacenamientoMemoria;
beforeEach(() => {
  alm = new AlmacenamientoMemoria();
  usarAlmacenamiento(alm);
});
afterAll(async () => {
  usarAlmacenamiento(null);
  await admin`UPDATE viaje SET km_fin = km_inicio, hora_fin = greatest(clock_timestamp(), hora_inicio) WHERE km_fin IS NULL AND conductor_persona_id = ANY(${personas}::uuid[])`;
  await admin`UPDATE persona SET activo = false WHERE id = ANY(${personas}::uuid[])`;
  await cerrarConexiones();
});
const uuid = () => crypto.randomUUID();
const foto = (extra: Record<string, unknown> = {}) => ({ mime: 'image/jpeg', bytes: 1000, claveIdempotencia: uuid(), ...extra });
/** Lo que haría el celular con la URL firmada: subir el archivo crudo. */
const subir = (ruta: string, bytes: number, mime = 'image/jpeg') => alm.objetos.set(ruta, { datos: new Uint8Array(bytes), mime });
const rutaDe = async (id: string) => ((await admin`SELECT ruta FROM archivo WHERE id = ${id}`)[0].ruta as string);

async function escenario() {
  const tag = uuid().slice(0, 8);
  const coord = await sesion(['comercial']);
  const op = await sesion(['montaje']);
  const ajeno = await sesion(['montaje']);
  const persona = async (s: { usuarioId: string }, n: string) => {
    const [p] = await admin`INSERT INTO persona (nombre, ci) VALUES (${'zz_test_arch' + n + tag}, ${'A4' + n + tag}) RETURNING id`;
    personas.push(p.id);
    await admin`UPDATE usuario SET persona_id = ${p.id} WHERE id = ${s.usuarioId}`;
    return p.id as string;
  };
  const pOp = await persona(op, 'op');
  await persona(ajeno, 'aj');
  const [v] = await admin`INSERT INTO vehiculo (chapa, marca_modelo) VALUES (${'ZF' + tag.toUpperCase()}, 'zz_test') RETURNING id`;
  const [c] = await admin`INSERT INTO cliente (codigo, nombre) VALUES (${'ZF' + tag}, ${'zz_test_cliF_' + tag}) RETURNING id`;
  const [s] = await admin`INSERT INTO sucursal (cliente_id, nombre, gps_lat, gps_lng) VALUES (${c.id}, 'Local', -25.27, -57.48) RETURNING id`;
  const ot = (await coord('POST', '/api/comercial/ot', { clienteId: c.id, sucursalId: s.id, titulo: 'zz_test fotos' })).j;
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(new Date());
  const hoja = (await coord('POST', '/api/hojas-ruta', { fecha: hoy, vehiculoId: v.id })).j;
  await coord('POST', `/api/hojas-ruta/${hoja.id}/personas`, { personaId: pOp, rol: 'CONDUCTOR' });
  const parada = (await coord('POST', `/api/hojas-ruta/${hoja.id}/paradas`, { ordenTrabajoId: ot.id })).j;
  return { coord, op, ajeno, vehiculo: v.id as string, hoja: hoja.id as string, parada: parada.id as string };
}

describe('L4.E3 — fotos del odómetro y de montaje (CA-4.7)', () => {
  it('odómetro por la clave del viaje: pedir → subir → confirmar; idempotente; una sola foto por momento', async () => {
    const e = await escenario();
    const claveViaje = uuid();
    // La foto puede llegar antes que el inicio del viaje (ambos sin señal): espera con 404.
    expect((await e.op('POST', '/api/archivos/solicitar', foto({ tipo: 'ODOMETRO_INICIO', claveViaje }))).status).toBe(404);
    const v = (await e.op('POST', '/api/campo/viajes/iniciar', { vehiculoId: e.vehiculo, hojaRutaId: e.hoja, kmInicio: 100, claveIdempotencia: claveViaje })).j;
    const cuerpo = foto({ tipo: 'ODOMETRO_INICIO', claveViaje });
    const a = await e.op('POST', '/api/archivos/solicitar', cuerpo);
    expect(a.status).toBe(201);
    expect(a.j).toMatchObject({ estado: 'PENDIENTE', mime: 'image/jpeg' });
    expect(String(a.j.subirA)).toContain('/subir/');
    expect((await e.op('POST', '/api/archivos/solicitar', cuerpo)).j.id).toBe(a.j.id);
    const ruta = await rutaDe(a.j.id as string);
    // Sin nombres ni datos personales en la ruta: tipo/mes/uuid.extensión.
    expect(ruta).toMatch(/^odometro_inicio\/\d{4}-\d{2}\/[0-9a-f-]{36}\.jpg$/);
    expect((await e.op('POST', `/api/archivos/${a.j.id}/confirmar`)).status).toBe(409); // todavía no subió
    subir(ruta, 1234);
    const ok = await e.op('POST', `/api/archivos/${a.j.id}/confirmar`);
    expect(ok.j).toMatchObject({ estado: 'SUBIDO', repetido: false });
    expect((await e.op('POST', `/api/archivos/${a.j.id}/confirmar`)).j.repetido).toBe(true);
    const [fila] = await admin`SELECT bytes, viaje_id, sin_senal FROM archivo WHERE id = ${a.j.id as string}`;
    expect(fila).toMatchObject({ bytes: 1234, viaje_id: v.id, sin_senal: false });
    // Segunda foto del mismo momento: no se reemplaza.
    expect((await e.op('POST', '/api/archivos/solicitar', foto({ tipo: 'ODOMETRO_INICIO', viajeId: v.id }))).status).toBe(409);
    // Ver: el conductor y comercial sí; otro montador no (404, sin confirmar que existe).
    const lista = (await e.op('GET', `/api/archivos?viajeId=${v.id}`)).j as unknown as { url: string; bytes: number }[];
    expect(lista).toHaveLength(1);
    expect(lista[0].url).toContain('/ver/');
    expect(JSON.stringify(lista)).not.toContain('"ruta"');
    expect((await e.coord('GET', `/api/archivos?viajeId=${v.id}`)).status).toBe(200);
    expect((await e.ajeno('GET', `/api/archivos?viajeId=${v.id}`)).status).toBe(404);
    // Otro montador tampoco sube la foto de un viaje ajeno.
    expect((await e.ajeno('POST', '/api/archivos/solicitar', foto({ tipo: 'ODOMETRO_FIN', viajeId: v.id }))).status).toBe(403);
    // Solo quien lo pidió confirma.
    expect((await e.ajeno('POST', `/api/archivos/${a.j.id}/confirmar`)).status).toBe(404);
  });

  it('tamaño máximo: el esquema frena lo declarado y la confirmación frena (y borra) lo que de verdad se subió', async () => {
    const e = await escenario();
    const v = (await e.op('POST', '/api/campo/viajes/iniciar', { vehiculoId: e.vehiculo, kmInicio: 1, claveIdempotencia: uuid() })).j;
    expect((await e.op('POST', '/api/archivos/solicitar', foto({ tipo: 'ODOMETRO_INICIO', viajeId: v.id, bytes: 6 * 1048576 }))).status).toBe(400);
    expect((await e.op('POST', '/api/archivos/solicitar', foto({ tipo: 'ODOMETRO_INICIO', viajeId: v.id, mime: 'application/pdf' }))).status).toBe(400);
    const a = (await e.op('POST', '/api/archivos/solicitar', foto({ tipo: 'ODOMETRO_INICIO', viajeId: v.id }))).j;
    const ruta = await rutaDe(a.id as string);
    subir(ruta, 6 * 1048576); // declaró 1000 bytes, subió 6 MB
    const r = await e.op('POST', `/api/archivos/${a.id}/confirmar`);
    expect(r.status).toBe(400);
    expect(String(r.j.error)).toMatch(/máximo/);
    expect(alm.objetos.has(ruta)).toBe(false);
    const b = (await e.op('POST', '/api/archivos/solicitar', foto({ tipo: 'ODOMETRO_INICIO', viajeId: v.id }))).j;
    subir(await rutaDe(b.id as string), 500, 'text/html'); // tipo distinto al declarado
    expect((await e.op('POST', `/api/archivos/${b.id}/confirmar`)).status).toBe(400);
  });

  it('el archivo solo cambia una vez (PENDIENTE → SUBIDO) y no se borra, ni con el rol de la API', async () => {
    const e = await escenario();
    const v = (await e.op('POST', '/api/campo/viajes/iniciar', { vehiculoId: e.vehiculo, kmInicio: 1, claveIdempotencia: uuid() })).j;
    const a = (await e.op('POST', '/api/archivos/solicitar', foto({ tipo: 'ODOMETRO_INICIO', viajeId: v.id }))).j;
    const id = a.id as string;
    await expect(apiDb`UPDATE archivo SET ruta = ${'evidencia_parada/2026-11/' + uuid() + '.jpg'} WHERE id = ${id}`).rejects.toMatchObject({ code: '23514' });
    subir(await rutaDe(id), 10);
    await e.op('POST', `/api/archivos/${id}/confirmar`);
    await expect(apiDb`UPDATE archivo SET estado = 'PENDIENTE', bytes = NULL, subido_at = NULL WHERE id = ${id}`).rejects.toMatchObject({ code: '23514' });
    await expect(apiDb`DELETE FROM archivo WHERE id = ${id}`).rejects.toBeTruthy();
    // Un tipo no puede colgar de otra cosa (CHECK del motor).
    await expect(admin`INSERT INTO archivo (tipo, ruta, mime, bytes_declarados, parada_id, subido_por, clave_idempotencia)
      VALUES ('ODOMETRO_FIN', ${'odometro_fin/2026-11/' + uuid() + '.jpg'}, 'image/jpeg', 10, ${e.parada}, ${e.op.usuarioId}, ${uuid()})`).rejects.toMatchObject({ code: '23514' });
  });

  it('evidencia de montaje: solo la cuadrilla sube; hora real si se sacó sin señal', async () => {
    const e = await escenario();
    expect((await e.ajeno('POST', '/api/archivos/solicitar', foto({ tipo: 'EVIDENCIA_PARADA', paradaId: e.parada }))).status).toBe(403);
    const tomada = new Date(Date.now() - 3 * 3600_000).toISOString();
    const a = (await e.op('POST', '/api/archivos/solicitar', foto({ tipo: 'EVIDENCIA_PARADA', paradaId: e.parada, tomadaAt: tomada }))).j;
    subir(await rutaDe(a.id as string), 300);
    expect((await e.op('POST', `/api/archivos/${a.id}/confirmar`)).status).toBe(200);
    const [f] = await admin`SELECT sin_senal, tomada_at FROM archivo WHERE id = ${a.id as string}`;
    expect(f.sin_senal).toBe(true);
    expect(new Date(f.tomada_at).toISOString()).toBe(tomada);
    const vieja = new Date(Date.now() - 80 * 3600_000).toISOString();
    expect((await e.op('POST', '/api/archivos/solicitar', foto({ tipo: 'EVIDENCIA_PARADA', paradaId: e.parada, tomadaAt: vieja }))).status).toBe(400);
    expect(((await e.coord('GET', `/api/archivos?paradaId=${e.parada}`)).j as unknown as unknown[]).length).toBe(1);
    expect((await e.coord('GET', `/api/archivos?paradaId=${e.parada}&viajeId=${uuid()}`)).status).toBe(400);
  });

  it('sin almacenamiento configurado: 503, sin dejar nada a medias; el uso solo lo ve admin', async () => {
    const e = await escenario();
    usarAlmacenamiento(null);
    const prev = process.env.SUPABASE_SECRET_KEY;
    delete process.env.SUPABASE_SECRET_KEY;
    try {
      const r = await e.op('POST', '/api/archivos/solicitar', foto({ tipo: 'EVIDENCIA_PARADA', paradaId: e.parada }));
      expect(r.status).toBe(503);
      const [{ n }] = await admin`SELECT count(*)::int AS n FROM archivo WHERE parada_id = ${e.parada}`;
      expect(n).toBe(0);
    } finally {
      if (prev) process.env.SUPABASE_SECRET_KEY = prev;
    }
    expect((await e.coord('GET', '/api/archivos/uso')).status).toBe(403);
    const jefe = await sesion(['admin']);
    expect((await jefe('GET', '/api/archivos/uso')).j).toMatchObject({ limite_bytes: 1024 ** 3 });
  });
});
