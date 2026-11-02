import { describe, it, expect, afterAll } from 'vitest';
import { admin, cerrarConexiones } from '../loop0/helpers.js';
import { crearUsuario, post } from '../loop0/auth-helpers.js';
import { app } from '../../apps/api/src/index.js';

afterAll(cerrarConexiones);

const ORIGEN = process.env.APP_ORIGIN || 'http://localhost:3000';

async function sesionCookie(capacidades: string[]) {
  const u = await crearUsuario(capacidades);
  const res = await post('/api/auth/login', { username: u.username, password: 'Password123!' });
  return { u, cookie: res.headers.get('set-cookie')!.split(';')[0] };
}

function req(method: string, path: string, cookie?: string, body?: unknown) {
  const headers: Record<string, string> = { origin: ORIGEN };
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return app.request(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe('L2.E1 — Tarifas: vigencias, solapamiento 409 (23P01) e inmutabilidad (CA-2.3, CA-2.4)', () => {
  it('gestiona tarifas de persona, rechaza solapamientos con 409 y bloquea modificaciones indebidas', async () => {
    const { cookie: cookieRrhh } = await sesionCookie(['rrhh']);
    const { cookie: cookieComercial } = await sesionCookie(['comercial']);
    const tag = Date.now().toString(36);

    // 1. Crear persona de prueba
    const [persona] = await admin<{ id: string }[]>`
      INSERT INTO persona (nombre, ci)
      VALUES (${'zz_test_persona_tarifa_' + tag}, ${'zz_ci_tar_' + tag})
      RETURNING id
    `;

    try {
      // 2. Comercial no puede ver ni crear tarifas (403)
      const res403Get = await req('GET', `/api/personas/${persona.id}/tarifas`, cookieComercial);
      expect(res403Get.status).toBe(403);

      const res403Post = await req('POST', `/api/personas/${persona.id}/tarifas`, cookieComercial, {
        tarifaHoraGs: 50000,
        fechaInicio: '2026-01-01',
        fechaFin: '2026-06-30',
      });
      expect(res403Post.status).toBe(403);

      // 3. RRHH crea primera tarifa válida
      const resT1 = await req('POST', `/api/personas/${persona.id}/tarifas`, cookieRrhh, {
        tarifaHoraGs: 50000,
        fechaInicio: '2026-01-01',
        fechaFin: '2026-06-30',
      });
      expect(resT1.status).toBe(201);
      const t1 = await resT1.json();
      expect(t1.id).toBeDefined();

      // 4. Intentar insertar tarifa que se solapa -> debe responder 409 por 23P01 en traducirErrorPg
      const resSolapada = await req('POST', `/api/personas/${persona.id}/tarifas`, cookieRrhh, {
        tarifaHoraGs: 55000,
        fechaInicio: '2026-05-01', // Se solapa con 2026-01-01..2026-06-30
        fechaFin: '2026-08-31',
      });
      expect(resSolapada.status).toBe(409);
      const errSolapada = await resSolapada.json();
      expect(errSolapada.error).toMatch(/solapamiento/i);

      // 5. Insertar tarifa contigua abierta (2026-07-01 en adelante) -> debe ser exitosa
      const resT2 = await req('POST', `/api/personas/${persona.id}/tarifas`, cookieRrhh, {
        tarifaHoraGs: 60000,
        fechaInicio: '2026-07-01',
      });
      expect(resT2.status).toBe(201);
      const t2 = await resT2.json();
      expect(t2.fecha_fin).toBeNull();

      // 6. Cerrar tarifa abierta
      const resCerrar = await req('PATCH', `/api/tarifas/${t2.id}/cerrar`, cookieRrhh, {
        fechaFin: '2026-12-31',
      });
      expect(resCerrar.status).toBe(200);
      const cerrada = await resCerrar.json();
      expect(cerrada.fecha_fin).toContain('2026-12-31');

      // 7. Intentar modificar tarifa ya cerrada a nivel DB -> disparador bloquea con error
      let falloUpdateCerrada = false;
      try {
        await admin`UPDATE tarifa_persona SET fecha_fin = '2027-01-01' WHERE id = ${t2.id}`;
      } catch (e: unknown) {
        falloUpdateCerrada = true;
        expect((e as Error).message).toMatch(/No se puede modificar una tarifa con vigencia cerrada/i);
      }
      expect(falloUpdateCerrada).toBe(true);

      // 8. Intentar eliminar tarifa -> trigger bloquear_modificacion_inmutable lo impide
      let falloDelete = false;
      try {
        await admin`DELETE FROM tarifa_persona WHERE id = ${t1.id}`;
      } catch (e: unknown) {
        falloDelete = true;
        expect((e as Error).message).toMatch(/inmutable/i);
      }
      expect(falloDelete).toBe(true);
    } finally {
      // Limpieza con bypass directo de triggers temporales en test si hiciera falta, o cascade
      await admin`DROP TRIGGER trg_tarifa_persona_no_delete ON tarifa_persona`;
      await admin`DELETE FROM tarifa_persona WHERE persona_id = ${persona.id}`;
      await admin`
        CREATE TRIGGER trg_tarifa_persona_no_delete BEFORE DELETE ON tarifa_persona
        FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_inmutable()
      `;
      await admin`DELETE FROM persona WHERE id = ${persona.id}`;
    }
  });
});
