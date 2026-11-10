import { describe, it, expect, afterAll } from 'vitest';
import { admin, cerrarConexiones } from '../loop0/helpers.js';
import { sesion, ok, llevarA, type Sesion } from '../loop10/escenario.js';

afterAll(cerrarConexiones);

/** Proyecto de 4 locales aprobado (una OT por local) y una hoja de ruta de hoy, vacía. */
async function escenario(juan: Sesion) {
  const tag = crypto.randomUUID().slice(0, 8);
  const c = await ok(juan, 'POST', '/api/clientes', { nombre: `zz_test_cli_hp_${tag}` });
  const locales: string[] = [];
  for (const n of ['A', 'B', 'C', 'D']) locales.push((await ok(juan, 'POST', `/api/clientes/${c.id}/sucursales`, { nombre: `Local ${n}`, gpsLat: -25.3, gpsLng: -57.6 })).id);
  const p = await ok(juan, 'POST', '/api/presupuestos', { clienteId: c.id, titulo: `zz_test proyecto ${tag}`, margenPct: 0 });
  for (const s of locales) await ok(juan, 'POST', `/api/presupuestos/${p.id}/items`, { sucursalId: s, concepto: 'MATERIAL', descripcion: 'Lona', cantidad: 1, unidad: 'UNIDAD', precioUnitarioGs: 100_000 });
  await ok(juan, 'POST', `/api/presupuestos/${p.id}/enviar`, { desde: 'BORRADOR' });
  const ap = await ok(juan, 'POST', `/api/presupuestos/${p.id}/aprobar`, { desde: 'ENVIADO', comentario: 'zz_test OC' });
  const ots = [...(ap.ots as { id: string; codigo_ot: string }[])].sort((a, b) => a.codigo_ot.localeCompare(b.codigo_ot));
  const hoja = await ok(juan, 'POST', '/api/hojas-ruta', { fecha: '2030-01-15', descripcion: `zz_test hoja ${tag}` });
  return { proyectoId: ap.proyecto.id as string, ots, hojaId: hoja.id as string };
}
const paradasDe = async (juan: Sesion, hojaId: string) =>
  ((await ok(juan, 'GET', `/api/hojas-ruta/${hojaId}`)).paradas as { codigo_ot: string; orden_secuencia: number; tipo: string }[]);

describe('L4.E5 — agregar un proyecto entero a la hoja de ruta', () => {
  it('CA-4.20: agrega las OTs abiertas en orden, al final, salteando las cerradas y las que ya están', async () => {
    const juan = await sesion(['admin']);
    const e = await escenario(juan);
    await llevarA(juan, e.ots[1].id, ['PENDIENTE', 'EN_TALLER', 'TERMINADO']);
    await ok(juan, 'POST', `/api/hojas-ruta/${e.hojaId}/paradas`, { ordenTrabajoId: e.ots[2].id });
    const r = await ok(juan, 'POST', `/api/hojas-ruta/${e.hojaId}/paradas-proyecto`, { proyectoId: e.proyectoId });
    expect(r.agregadas.map((x: { codigo_ot: string }) => x.codigo_ot)).toEqual([e.ots[0].codigo_ot, e.ots[3].codigo_ot]);
    expect(r.salteadas).toEqual(expect.arrayContaining([{ codigo_ot: e.ots[1].codigo_ot, motivo: 'cerrada' }, { codigo_ot: e.ots[2].codigo_ot, motivo: 'ya_esta' }]));
    const paradas = await paradasDe(juan, e.hojaId);
    expect(paradas.map((p) => [p.orden_secuencia, p.codigo_ot, p.tipo])).toEqual([
      [1, e.ots[2].codigo_ot, 'PLANIFICADA'], [2, e.ots[0].codigo_ot, 'PLANIFICADA'], [3, e.ots[3].codigo_ot, 'PLANIFICADA'],
    ]);
  });

  it('CA-4.21: con la hoja en curso exige motivo y las marca EXTRA', async () => {
    const juan = await sesion(['admin']);
    const e = await escenario(juan);
    await admin`UPDATE hoja_ruta SET estado = 'EN_CURSO' WHERE id = ${e.hojaId}`;
    expect((await juan('POST', `/api/hojas-ruta/${e.hojaId}/paradas-proyecto`, { proyectoId: e.proyectoId })).status).toBe(400);
    expect(await paradasDe(juan, e.hojaId)).toHaveLength(0);
    const r = await ok(juan, 'POST', `/api/hojas-ruta/${e.hojaId}/paradas-proyecto`, { proyectoId: e.proyectoId, motivoExtra: 'zz_test se sumaron los locales' });
    expect(r.agregadas).toHaveLength(4);
    expect((await paradasDe(juan, e.hojaId)).every((p) => p.tipo === 'EXTRA')).toBe(true);
  });

  it('CA-4.22: hoja finalizada 409; proyecto sin nada para agregar o inexistente 400, sin cambios', async () => {
    const juan = await sesion(['admin']);
    const e = await escenario(juan);
    await ok(juan, 'POST', `/api/hojas-ruta/${e.hojaId}/paradas-proyecto`, { proyectoId: e.proyectoId });
    const otraVez = await juan('POST', `/api/hojas-ruta/${e.hojaId}/paradas-proyecto`, { proyectoId: e.proyectoId });
    expect(otraVez.status).toBe(400);
    expect(await paradasDe(juan, e.hojaId)).toHaveLength(4);
    expect((await juan('POST', `/api/hojas-ruta/${e.hojaId}/paradas-proyecto`, { proyectoId: crypto.randomUUID() })).status).toBe(400);
    await admin`UPDATE hoja_ruta SET estado = 'FINALIZADA' WHERE id = ${e.hojaId}`;
    expect((await juan('POST', `/api/hojas-ruta/${e.hojaId}/paradas-proyecto`, { proyectoId: e.proyectoId })).status).toBe(409);
  });

  it('CA-4.23: el taller no puede armar hojas', async () => {
    const edu = await sesion(['taller']);
    expect((await edu('POST', `/api/hojas-ruta/${crypto.randomUUID()}/paradas-proyecto`, { proyectoId: crypto.randomUUID() })).status).toBe(403);
  });
});
