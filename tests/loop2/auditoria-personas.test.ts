import { describe, it, expect, afterAll } from 'vitest';
import { admin, cerrarConexiones } from '../loop0/helpers.js';
import { crearUsuario, post } from '../loop0/auth-helpers.js';
import { app } from '../../apps/api/src/index.js';

afterAll(cerrarConexiones);

const ORIGEN = process.env.APP_ORIGIN || 'http://localhost:3000';

async function sesion(capacidades: string[]) {
  const u = await crearUsuario(capacidades);
  const res = await post('/api/auth/login', { username: u.username, password: 'Password123!' });
  return { u, cookie: res.headers.get('set-cookie')!.split(';')[0] };
}

function req(method: string, path: string, cookie: string, body?: unknown) {
  const headers: Record<string, string> = { origin: ORIGEN, cookie };
  if (body !== undefined) headers['content-type'] = 'application/json';
  return app.request(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
}

async function eventos(recursoId: string, accion: string) {
  const [{ n }] = await admin`
    SELECT count(*)::int AS n FROM evento_auditoria WHERE recurso_id = ${recursoId} AND accion = ${accion}
  `;
  return n as number;
}

describe('L2.E1 — Auditoría de personas y tarifas en la misma transacción (CA-0.5)', () => {
  it('crear persona, crear y cerrar tarifa, y vincular usuario dejan un evento de auditoría cada una', async () => {
    const { cookie } = await sesion(['rrhh', 'admin']);
    const ci = 'zz' + Date.now().toString(36);

    const persona = await (await req('POST', '/api/personas', cookie, { nombre: 'zz_test_aud', ci })).json();
    expect(await eventos(persona.id, 'persona.crear')).toBe(1);

    const tarifa = await (
      await req('POST', `/api/personas/${persona.id}/tarifas`, cookie, { tarifaHoraGs: 25000, fechaInicio: '2026-01-01' })
    ).json();
    expect(await eventos(tarifa.id, 'tarifa.crear')).toBe(1);

    const cierre = await req('PATCH', `/api/tarifas/${tarifa.id}/cerrar`, cookie, { fechaFin: '2026-06-30' });
    expect(cierre.status).toBe(200);
    expect(await eventos(tarifa.id, 'tarifa.cerrar')).toBe(1);

    const operario = await crearUsuario(['taller']);
    const vinc = await req('PATCH', `/api/personas/${persona.id}/usuario`, cookie, { usuarioId: operario.id });
    expect(vinc.status).toBe(200);
    expect(await eventos(persona.id, 'persona.vincular_usuario')).toBe(1);
  });

  it('una tarifa solapada no deja evento de auditoría (se revierte con la mutación)', async () => {
    const { cookie } = await sesion(['rrhh']);
    const persona = await (
      await req('POST', '/api/personas', cookie, { nombre: 'zz_test_aud2', ci: 'zy' + Date.now().toString(36) })
    ).json();
    await req('POST', `/api/personas/${persona.id}/tarifas`, cookie, { tarifaHoraGs: 20000, fechaInicio: '2026-01-01' });
    const [{ antes }] = await admin`SELECT count(*)::int AS antes FROM evento_auditoria WHERE accion = 'tarifa.crear'`;

    const solapada = await req('POST', `/api/personas/${persona.id}/tarifas`, cookie, {
      tarifaHoraGs: 30000,
      fechaInicio: '2026-03-01',
    });
    expect(solapada.status).toBe(409);
    const [{ despues }] = await admin`SELECT count(*)::int AS despues FROM evento_auditoria WHERE accion = 'tarifa.crear'`;
    expect(despues).toBe(antes);
  });

  it('vincular un usuario que ya pertenece a otra persona responde 409 y no pisa el vínculo', async () => {
    const { cookie } = await sesion(['rrhh', 'admin']);
    const base = Date.now().toString(36);
    const a = await (await req('POST', '/api/personas', cookie, { nombre: 'zz_test_a', ci: 'za' + base })).json();
    const b = await (await req('POST', '/api/personas', cookie, { nombre: 'zz_test_b', ci: 'zb' + base })).json();
    const operario = await crearUsuario(['taller']);

    expect((await req('PATCH', `/api/personas/${a.id}/usuario`, cookie, { usuarioId: operario.id })).status).toBe(200);
    expect((await req('PATCH', `/api/personas/${b.id}/usuario`, cookie, { usuarioId: operario.id })).status).toBe(409);

    const [u] = await admin`SELECT persona_id FROM usuario WHERE id = ${operario.id}`;
    expect(u.persona_id).toBe(a.id);
  });
});
