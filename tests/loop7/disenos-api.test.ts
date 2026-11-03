import { describe, it, expect, afterAll } from 'vitest';
import { admin, api as apiDb, cerrarConexiones } from '../loop0/helpers.js';
import { sesion } from '../loop3/helpers-comercial.js';

const personas: string[] = [];
afterAll(async () => {
  await admin`UPDATE persona SET activo = false WHERE id = ANY(${personas}::uuid[])`;
  await cerrarConexiones();
});

const DRIVE = 'https://drive.google.com/file/d/1CFLn7P_zz_test/view?usp=drive_link';

/** Sofi (comercial), Edu (taller), Nachi (diseno, con persona) y una OT con tarea DISENO asignada a Nachi. */
async function escenario() {
  const tag = crypto.randomUUID().slice(0, 8);
  const sofi = await sesion(['comercial']);
  const edu = await sesion(['taller']);
  const nachi = await sesion(['diseno']);
  const [p] = await admin`INSERT INTO persona (nombre, ci) VALUES (${'zz_test_nachi_' + tag}, ${'CI-N' + tag}) RETURNING id`;
  personas.push(p.id);
  await admin`UPDATE usuario SET persona_id = ${p.id} WHERE id = ${nachi.usuarioId}`;
  const [c] = await admin`INSERT INTO cliente (codigo, nombre) VALUES (${'ZN' + tag}, ${'zz_test_Frutos de los Andes ' + tag}) RETURNING id`;
  const ot = (await sofi('POST', '/api/comercial/ot', {
    clienteId: c.id, titulo: 'zz_test Ruleta Segafredo',
    tareas: [{ tipo: 'DISENO', descripcion: 'Diseño ruleta', personaAsignadaId: p.id }],
  })).j;
  return { sofi, edu, nachi, ot: ot.id as string, cliente: c.id as string };
}

describe('Loop 7 — diseños: enlace de Drive, verificación de Juan o Sofi, cola de Edu', () => {
  it('Nachi sube → no está en la cola de Edu → Sofi aprueba → aparece en la cola con el enlace', async () => {
    const e = await escenario();
    const sub = await e.nachi('POST', `/api/disenos/ot/${e.ot}`, { origen: 'DISENADORA', driveUrl: DRIVE });
    expect(sub.status).toBe(201);
    const enCola = async () => ((await e.edu('GET', '/api/disenos/cola')).j as unknown as { orden_trabajo_id: string }[]).some((x) => x.orden_trabajo_id === e.ot);
    expect(await enCola()).toBe(false);
    const pend = (await e.sofi('GET', '/api/disenos/pendientes')).j as unknown as { id: string }[];
    expect(pend.map((x) => x.id)).toContain(sub.j.id);
    expect((await e.sofi('POST', `/api/disenos/${sub.j.id}/aprobar`)).status).toBe(200);
    expect(await enCola()).toBe(true);
    expect((await e.sofi('POST', `/api/disenos/${sub.j.id}/aprobar`)).status).toBe(409); // una sola revisión
  });

  it('el diseño del cliente también se verifica; observar exige motivo y Nachi sube la v2', async () => {
    const e = await escenario();
    const v1 = (await e.sofi('POST', `/api/disenos/ot/${e.ot}`, { origen: 'CLIENTE', driveUrl: DRIVE })).j;
    expect((await e.sofi('POST', `/api/disenos/ot/${e.ot}`, { origen: 'CLIENTE', driveUrl: DRIVE })).status).toBe(409); // ya hay una pendiente
    expect((await e.sofi('POST', `/api/disenos/${v1.id}/observar`, { observacion: '' })).status).toBe(400);
    expect((await e.sofi('POST', `/api/disenos/${v1.id}/observar`, { observacion: 'La mesada mide 2,40 m, no 2,10' })).status).toBe(200);
    const v2 = await e.nachi('POST', `/api/disenos/ot/${e.ot}`, { origen: 'DISENADORA', driveUrl: DRIVE + '&v=2' });
    expect(v2.j.version).toBe(2);
    const versiones = (await e.edu('GET', `/api/disenos/ot/${e.ot}`)).j as unknown as { version: number; estado: string; observacion: string | null }[];
    expect(versiones.map((v) => `${v.version}:${v.estado}`)).toEqual(['2:PENDIENTE', '1:OBSERVADO']);
    expect(versiones[1].observacion).toMatch(/2,40/);
  });

  it('permisos: Nachi no sube diseños del cliente ni en OTs sin su tarea; Edu no aprueba; solo enlaces de Drive', async () => {
    const e = await escenario();
    expect((await e.nachi('POST', `/api/disenos/ot/${e.ot}`, { origen: 'CLIENTE', driveUrl: DRIVE })).status).toBe(403);
    const ajena = (await e.sofi('POST', '/api/comercial/ot', { clienteId: e.cliente, titulo: 'zz_test sin diseño' })).j;
    expect((await e.nachi('POST', `/api/disenos/ot/${ajena.id}`, { origen: 'DISENADORA', driveUrl: DRIVE })).status).toBe(403);
    expect((await e.nachi('POST', `/api/disenos/ot/${e.ot}`, { origen: 'DISENADORA', driveUrl: 'https://wetransfer.com/x' })).status).toBe(400);
    const v = (await e.nachi('POST', `/api/disenos/ot/${e.ot}`, { origen: 'DISENADORA', driveUrl: DRIVE })).j;
    expect((await e.edu('POST', `/api/disenos/${v.id}/aprobar`)).status).toBe(403);
    expect((await e.nachi('GET', '/api/disenos/pendientes')).status).toBe(403);
  });

  it('motor: una versión revisada no se modifica ni se borra', async () => {
    const e = await escenario();
    const v = (await e.sofi('POST', `/api/disenos/ot/${e.ot}`, { origen: 'CLIENTE', driveUrl: DRIVE })).j;
    await e.sofi('POST', `/api/disenos/${v.id}/aprobar`);
    await expect(apiDb`UPDATE diseno_version SET drive_url = ${DRIVE + 'x'} WHERE id = ${v.id as string}`).rejects.toMatchObject({ code: '23514' });
    await expect(apiDb`DELETE FROM diseno_version WHERE id = ${v.id as string}`).rejects.toBeTruthy();
  });
});
