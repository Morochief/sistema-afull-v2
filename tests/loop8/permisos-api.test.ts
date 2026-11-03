import { describe, it, expect, afterAll } from 'vitest';
import { admin, api as apiDb, cerrarConexiones } from '../loop0/helpers.js';
import { sesion } from '../loop3/helpers-comercial.js';
import { puedeTransicionarPermiso, fueraDePlazo, nuevaSolicitudPermisoSchema } from '../../packages/shared/src/index.js';

afterAll(cerrarConexiones);
const uuid = () => crypto.randomUUID();
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(new Date());

async function escenario() {
  const tag = uuid().slice(0, 8);
  const edu = await sesion(['taller']);
  const otro = await sesion(['montaje']);
  const juan = await sesion(['admin']);
  const sofi = await sesion(['rrhh']);
  const persona = async (s: { usuarioId: string }, n: string) => {
    const [p] = await admin`INSERT INTO persona (nombre, ci) VALUES (${'zz_test_' + n + ' ' + tag}, ${'P8' + n + tag}) RETURNING id`;
    await admin`UPDATE usuario SET persona_id = ${p.id} WHERE id = ${s.usuarioId}`;
    return p.id as string;
  };
  return { tag, edu, otro, juan, sofi, pEdu: await persona(edu, 'Edu'), pOtro: await persona(otro, 'Otro') };
}
const salud = (extra: Record<string, unknown> = {}) => ({
  tipo: 'SALUD', detalleTipo: 'Gripe', motivo: 'Reposo médico de dos días', modalidad: 'DIAS',
  fechaDesde: hoy(), fechaHasta: hoy(), comprobanteUrl: 'https://drive.google.com/x', claveIdempotencia: uuid(), ...extra,
});

describe('Loop 8 — solicitudes de permiso', () => {
  it('reglas puras: transiciones, plazo de 24 h y validación del formulario', () => {
    expect(puedeTransicionarPermiso('PENDIENTE', 'AUTORIZADA')).toBe(true);
    expect(puedeTransicionarPermiso('PENDIENTE', 'REGISTRADA')).toBe(false);
    expect(puedeTransicionarPermiso('REGISTRADA', 'RECHAZADA')).toBe(false);
    expect(fueraDePlazo(new Date('2026-11-01T08:00:00-03:00'), new Date('2026-11-02T08:00:00-03:00'))).toBe(false);
    expect(fueraDePlazo(new Date('2026-11-01T08:00:00-03:00'), new Date('2026-11-02T08:01:00-03:00'))).toBe(true);
    const base = { motivo: 'Turno con el dentista', claveIdempotencia: uuid(), fechaDesde: '2026-11-05' };
    expect(nuevaSolicitudPermisoSchema.safeParse({ ...base, tipo: 'RETIRO_ANTICIPADO', modalidad: 'HORAS', horaDesde: '15:00', horaHasta: '17:00' }).success).toBe(true);
    expect(nuevaSolicitudPermisoSchema.safeParse({ ...base, tipo: 'RETIRO_ANTICIPADO', modalidad: 'HORAS', horaDesde: '17:00', horaHasta: '15:00' }).success).toBe(false);
    expect(nuevaSolicitudPermisoSchema.safeParse({ ...base, tipo: 'OTRO', modalidad: 'DIAS', fechaHasta: '2026-11-05' }).success).toBe(false);
    expect(nuevaSolicitudPermisoSchema.safeParse({ ...base, tipo: 'ESTUDIO', modalidad: 'DIAS', fechaHasta: '2026-11-04' }).success).toBe(false);
  });

  it('Edu pide; Juan autoriza; Sofi registra sin descuento; quedan las firmas y es idempotente (CA-8.1)', async () => {
    const e = await escenario();
    const cuerpo = salud();
    const a = await e.edu('POST', '/api/permisos', cuerpo);
    expect(a.status).toBe(201);
    expect(a.j.numero).toMatch(/^PER-\d{4}-\d{4,}$/);
    expect(a.j.fuera_de_plazo).toBe(false);
    expect((await e.edu('POST', '/api/permisos', cuerpo)).status).toBe(200);
    const id = a.j.id as string;
    // RR.HH. no puede registrar sin la firma del jefe; el operario no puede autorizarse.
    expect((await e.sofi('POST', `/api/permisos/${id}/transicionar`, { desde: 'PENDIENTE', a: 'REGISTRADA', conDescuento: false })).status).toBe(400);
    expect((await e.edu('POST', `/api/permisos/${id}/transicionar`, { desde: 'PENDIENTE', a: 'AUTORIZADA' })).status).toBe(403);
    expect((await e.juan('POST', `/api/permisos/${id}/transicionar`, { desde: 'PENDIENTE', a: 'AUTORIZADA' })).status).toBe(200);
    expect((await e.juan('POST', `/api/permisos/${id}/transicionar`, { desde: 'PENDIENTE', a: 'AUTORIZADA' })).status).toBe(409);
    expect((await e.sofi('POST', `/api/permisos/${id}/transicionar`, { desde: 'AUTORIZADA', a: 'REGISTRADA' })).status).toBe(400);
    expect((await e.sofi('POST', `/api/permisos/${id}/transicionar`, { desde: 'AUTORIZADA', a: 'REGISTRADA', conDescuento: false })).status).toBe(200);
    const d = (await e.edu('GET', `/api/permisos/${id}`)).j as { estado: string; con_descuento: boolean; eventos: { estado_nuevo: string }[] };
    expect([d.estado, d.con_descuento]).toEqual(['REGISTRADA', false]);
    expect(d.eventos.map((x) => x.estado_nuevo)).toEqual(['PENDIENTE', 'AUTORIZADA', 'REGISTRADA']);
    // Cerrada: nadie la mueve, ni siquiera la base con el rol de la API.
    expect((await e.juan('POST', `/api/permisos/${id}/transicionar`, { desde: 'REGISTRADA', a: 'RECHAZADA', comentario: 'x' })).status).toBe(400);
    await expect(apiDb`UPDATE solicitud_permiso SET con_descuento = true WHERE id = ${id}`).rejects.toThrow();
    await expect(apiDb`UPDATE solicitud_permiso_evento SET comentario = 'x' WHERE solicitud_id = ${id}`).rejects.toThrow();
  });

  it('alcance: cada operario ve solo lo suyo; RR.HH. ve todo y puede cargar a nombre de otro (CA-8.2)', async () => {
    const e = await escenario();
    const mia = (await e.edu('POST', '/api/permisos', salud())).j.id as string;
    expect((await e.otro('GET', `/api/permisos/${mia}`)).status).toBe(404);
    expect((await e.otro('POST', '/api/permisos', salud({ personaId: e.pEdu }))).status).toBe(403);
    const papel = await e.sofi('POST', '/api/permisos', salud({ personaId: e.pOtro, tipo: 'MATRIMONIO', detalleTipo: undefined }));
    expect(papel.status).toBe(201);
    const listaOtro = (await e.otro('GET', '/api/permisos')).j as { items: { id: string }[] };
    expect(listaOtro.items.map((x) => x.id)).toEqual([papel.j.id]);
    const listaRrhh = (await e.sofi('GET', `/api/permisos?q=${encodeURIComponent(e.tag)}`)).j as { items: unknown[]; tamPagina: number };
    expect([listaRrhh.items.length, listaRrhh.tamPagina]).toEqual([2, 25]);
  });

  it('anular solo el solicitante y en pendiente; rechazar exige motivo; fuera de plazo se marca (CA-8.3)', async () => {
    const e = await escenario();
    const id = (await e.edu('POST', '/api/permisos', salud())).j.id as string;
    expect((await e.otro('POST', `/api/permisos/${id}/transicionar`, { desde: 'PENDIENTE', a: 'ANULADA' })).status).toBe(403);
    expect((await e.edu('POST', `/api/permisos/${id}/transicionar`, { desde: 'PENDIENTE', a: 'ANULADA' })).status).toBe(200);
    const id2 = (await e.edu('POST', '/api/permisos', salud())).j.id as string;
    expect((await e.juan('POST', `/api/permisos/${id2}/transicionar`, { desde: 'PENDIENTE', a: 'RECHAZADA' })).status).toBe(400);
    expect((await e.juan('POST', `/api/permisos/${id2}/transicionar`, { desde: 'PENDIENTE', a: 'RECHAZADA', comentario: 'Sin certificado' })).status).toBe(200);
    const tarde = await e.edu('POST', '/api/permisos', salud({ fechaDesde: '2026-01-05', fechaHasta: '2026-01-06' }));
    expect(tarde.j.fuera_de_plazo).toBe(true);
    // Usuario sin persona vinculada no puede pedir para sí.
    const sinPersona = await sesion(['comercial']);
    expect((await sinPersona('POST', '/api/permisos', salud())).status).toBe(403);
  });
});
