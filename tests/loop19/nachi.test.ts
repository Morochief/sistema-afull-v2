import { describe, it, expect, afterAll } from 'vitest';
import { admin, cerrarConexiones } from '../loop0/helpers.js';
import { sesion } from '../loop3/helpers-comercial.js';

/** Loop 19 — Nachi verifica su diseño y lo corrige sin esperar a la oficina (docs/LOOP_19_NACHI_VERIFICA_DISENO.md). */
const personas: string[] = [];
afterAll(async () => {
  await admin`UPDATE persona SET activo = false WHERE id = ANY(${personas}::uuid[])`;
  await cerrarConexiones();
});

const DRIVE = (n: number) => `https://drive.google.com/file/d/zz_test_${n}/view`;
type Version = { id: string; version: number; estado: string; autoverificada: boolean; motivo_cambio: string | null; motivo_anulacion: string | null; observacion: string | null };

async function escenario() {
  const tag = crypto.randomUUID().slice(0, 8);
  const sofi = await sesion(['comercial']);
  const edu = await sesion(['taller']);
  const nachi = await sesion(['diseno']);
  const otra = await sesion(['diseno']);
  const [p] = await admin`INSERT INTO persona (nombre, ci) VALUES (${'zz_test_nachi19_' + tag}, ${'N19' + tag}) RETURNING id`;
  personas.push(p.id as string);
  await admin`UPDATE usuario SET persona_id = ${p.id} WHERE id = ${nachi.usuarioId}`;
  const [c] = await admin`INSERT INTO cliente (codigo, nombre) VALUES (${'Z19' + tag}, ${'zz_test_cli19_' + tag}) RETURNING id`;
  const ot = (await sofi('POST', '/api/comercial/ot', {
    clienteId: c.id, titulo: 'zz_test cartel', activarHoja: true,
    tareas: [{ tipo: 'DISENO', descripcion: 'zz_test diseñar cartel', personaAsignadaId: p.id }],
  })).j.id as string;
  const versiones = async () => (await sofi('GET', `/api/disenos/ot/${ot}`)).j as unknown as Version[];
  const enCola = async () => ((await edu('GET', '/api/disenos/cola')).j as unknown as { orden_trabajo_id: string; version: number }[]).find((x) => x.orden_trabajo_id === ot);
  return { sofi, edu, nachi, otra, ot, versiones, enCola };
}

describe('Loop 19 — Nachi verifica y corrige su diseño', () => {
  it('CA-19.1: sube con "Ya lo verifiqué": queda aprobada por la diseñadora y Edu la ve enseguida', async () => {
    const e = await escenario();
    const r = await e.nachi('POST', `/api/disenos/ot/${e.ot}`, { origen: 'DISENADORA', driveUrl: DRIVE(1), verificada: true });
    expect(r.status).toBe(201);
    const [v] = await e.versiones();
    expect([v.estado, v.autoverificada]).toEqual(['APROBADO', true]);
    expect((await e.enCola())?.version).toBe(1);
  });

  it('CA-19.2: verifica después su versión pendiente; no puede verificar la de otro; Mi trabajo muestra el estado', async () => {
    const e = await escenario();
    const deSofi = (await e.sofi('POST', `/api/disenos/ot/${e.ot}`, { origen: 'CLIENTE', driveUrl: DRIVE(1) })).j.id as string;
    expect((await e.nachi('POST', `/api/disenos/${deSofi}/verificar`)).status).toBe(403);
    await e.sofi('POST', `/api/disenos/${deSofi}/aprobar`);
    const suya = (await e.nachi('POST', `/api/disenos/ot/${e.ot}`, { origen: 'DISENADORA', driveUrl: DRIVE(2) })).j.id as string;
    const mt = async () => ((await e.nachi('GET', '/api/mi-trabajo')).j as { tareas: { orden_trabajo_id: string; ultimo_diseno: { version: number; estado: string; autoverificada: boolean } | null }[] }).tareas.find((t) => t.orden_trabajo_id === e.ot)!.ultimo_diseno;
    expect(await mt()).toMatchObject({ version: 2, estado: 'PENDIENTE' });
    expect((await e.otra('POST', `/api/disenos/${suya}/verificar`)).status).toBe(403);
    expect((await e.nachi('POST', `/api/disenos/${suya}/verificar`)).status).toBe(200);
    expect(await mt()).toMatchObject({ version: 2, estado: 'APROBADO', autoverificada: true });
    expect((await e.nachi('POST', `/api/disenos/${suya}/verificar`)).status).toBe(409);
  });

  it('CA-19.3: corrige una pendiente suya: la anterior queda ANULADA con el motivo y la nueva es la única pendiente', async () => {
    const e = await escenario();
    await e.nachi('POST', `/api/disenos/ot/${e.ot}`, { origen: 'DISENADORA', driveUrl: DRIVE(1) });
    const r = await e.nachi('POST', `/api/disenos/ot/${e.ot}`, { origen: 'DISENADORA', driveUrl: DRIVE(2), motivoCambio: 'Me equivoqué de enlace' });
    expect(r.status).toBe(201);
    const [v2, v1] = await e.versiones();
    expect([v2.version, v2.estado, v2.motivo_cambio]).toEqual([2, 'PENDIENTE', 'Me equivoqué de enlace']);
    expect([v1.estado, v1.motivo_anulacion]).toEqual(['ANULADA', 'Me equivoqué de enlace']);
    // Una pendiente de otra persona no se anula: sigue el 409 de antes.
    const s = await e.sofi('POST', `/api/disenos/ot/${e.ot}`, { origen: 'CLIENTE', driveUrl: DRIVE(3) });
    expect(s.status).toBe(409);
  });

  it('CA-19.4: corrige una aprobada: la OT sale de la cola de Edu hasta que verifica la nueva', async () => {
    const e = await escenario();
    await e.nachi('POST', `/api/disenos/ot/${e.ot}`, { origen: 'DISENADORA', driveUrl: DRIVE(1), verificada: true });
    expect((await e.enCola())?.version).toBe(1);
    const v2 = (await e.nachi('POST', `/api/disenos/ot/${e.ot}`, { origen: 'DISENADORA', driveUrl: DRIVE(2), motivoCambio: 'Edu vio un error en el teléfono' })).j.id as string;
    expect(await e.enCola()).toBeUndefined();
    expect((await e.versiones()).find((v) => v.version === 1)!.estado).toBe('APROBADO');
    await e.nachi('POST', `/api/disenos/${v2}/verificar`);
    expect((await e.enCola())?.version).toBe(2);
  });

  it('CA-19.5: la oficina observa una autoverificada (sale de la cola); una aprobada por la oficina no se observa después', async () => {
    const e = await escenario();
    const id = (await e.nachi('POST', `/api/disenos/ot/${e.ot}`, { origen: 'DISENADORA', driveUrl: DRIVE(1), verificada: true })).j.id as string;
    expect((await e.nachi('POST', `/api/disenos/${id}/observar`, { observacion: 'x' })).status).toBe(403);
    const o = await e.sofi('POST', `/api/disenos/${id}/observar`, { observacion: 'El teléfono está mal' });
    expect(o.status).toBe(200);
    const [v] = await e.versiones();
    expect([v.estado, v.observacion, v.autoverificada]).toEqual(['OBSERVADO', 'El teléfono está mal', true]);
    expect(await e.enCola()).toBeUndefined();
    const v2 = (await e.nachi('POST', `/api/disenos/ot/${e.ot}`, { origen: 'DISENADORA', driveUrl: DRIVE(2) })).j.id as string;
    await e.sofi('POST', `/api/disenos/${v2}/aprobar`);
    expect((await e.sofi('POST', `/api/disenos/${v2}/observar`, { observacion: 'x' })).status).toBe(409);
  });

  it('CA-19.6: las versiones no se borran y una ANULADA no cambia más', async () => {
    const e = await escenario();
    await e.nachi('POST', `/api/disenos/ot/${e.ot}`, { origen: 'DISENADORA', driveUrl: DRIVE(1) });
    await e.nachi('POST', `/api/disenos/ot/${e.ot}`, { origen: 'DISENADORA', driveUrl: DRIVE(2), motivoCambio: 'zz_test' });
    const anulada = (await e.versiones()).find((v) => v.estado === 'ANULADA')!;
    await expect(admin`DELETE FROM diseno_version WHERE id = ${anulada.id}`).rejects.toThrow();
    await expect(admin`UPDATE diseno_version SET estado = 'APROBADO', revisado_por = anulada_por, revisado_at = now() WHERE id = ${anulada.id}`).rejects.toThrow();
    const aprobada = (await e.nachi('POST', `/api/disenos/ot/${e.ot}`, { origen: 'DISENADORA', driveUrl: DRIVE(3), verificada: true, motivoCambio: 'zz_test' })).j.id as string;
    await expect(admin`UPDATE diseno_version SET drive_url = ${DRIVE(9)} WHERE id = ${aprobada}`).rejects.toThrow();
    await expect(admin`UPDATE diseno_version SET autoverificada = false WHERE id = ${aprobada}`).rejects.toThrow();
  });
});
