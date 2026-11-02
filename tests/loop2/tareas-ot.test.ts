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

describe('L2.E2 — Tareas de OT (Comercial)', () => {
  it('crea OT con lista de tareas atómicas, audita cada una y consulta lista con minutos', async () => {
    const { cookie } = await sesion(['comercial', 'rrhh']);
    const tag = Date.now().toString(36);

    const [cliente] = await admin`
      INSERT INTO cliente (codigo, nombre) VALUES (${'CL-' + tag}, ${'zz_cli_ot_' + tag}) RETURNING id
    `;
    const [persona] = await admin`
      INSERT INTO persona (nombre, ci) VALUES (${'zz_per_ot_' + tag}, ${'CI-' + tag}) RETURNING id
    `;

    // 1. Alta de OT con 2 tareas iniciales
    const resOT = await req('POST', '/api/comercial/ot', cookie, {
      clienteId: cliente.id,
      titulo: 'OT con Tareas Atómicas',
      tareas: [
        { tipo: 'TALLER_IMPRESION', descripcion: 'Imprimir lona front', personaAsignadaId: persona.id },
        { tipo: 'TALLER_HERRERIA', descripcion: 'Estructura bastidor 3x2' },
      ],
    });
    expect(resOT.status).toBe(201);
    const ot = await resOT.json();

    // 2. Consultar tareas de la OT
    const resTareas = await req('GET', `/api/comercial/ot/${ot.id}/tareas`, cookie);
    expect(resTareas.status).toBe(200);
    const tareas = await resTareas.json();
    expect(tareas).toHaveLength(2);
    expect(tareas[0].tipo).toBe('TALLER_IMPRESION');
    expect(tareas[0].persona_asignada_id).toBe(persona.id);
    expect(tareas[0].persona_asignada_nombre).toBe('zz_per_ot_' + tag);
    expect(tareas[0].minutos_trabajados).toBe(0);
    expect(tareas[1].tipo).toBe('TALLER_HERRERIA');
    expect(tareas[1].persona_asignada_id).toBeNull();

    // 3. Verificar auditoría y eventos iniciales de cada tarea
    const eventosTarea = await admin`
      SELECT count(*)::int AS n FROM tarea_evento WHERE tarea_id = ${tareas[0].id} AND estado_nuevo = 'PENDIENTE'
    `;
    expect(eventosTarea[0].n).toBe(1);

    const auditoriaTarea = await admin`
      SELECT count(*)::int AS n FROM evento_auditoria WHERE recurso_id = ${tareas[0].id} AND accion = 'tarea.crear'
    `;
    expect(auditoriaTarea[0].n).toBe(1);

    // 4. Agregar una 3ra tarea vía POST /api/comercial/ot/:id/tareas
    const resAdd = await req('POST', `/api/comercial/ot/${ot.id}/tareas`, cookie, {
      tipo: 'TALLER_ARMADO',
      descripcion: 'Montar lona en bastidor',
      personaAsignadaId: persona.id,
    });
    expect(resAdd.status).toBe(201);
    const t3 = await resAdd.json();
    expect(t3.orden_secuencia).toBe(3);

    // 5. Editar tarea: descripción y reasignación con control 409
    const resEdit = await req('PATCH', `/api/tareas/${t3.id}`, cookie, {
      descripcion: 'Montar lona tensada en bastidor',
      updatedAt: t3.updated_at,
    });
    expect(resEdit.status).toBe(200);

    const res409 = await req('PATCH', `/api/tareas/${t3.id}`, cookie, {
      descripcion: 'Otro texto',
      updatedAt: t3.updated_at, // Stale!
    });
    expect(res409.status).toBe(409);

    // 6. Cancelar tarea con comentario obligatorio
    const resCancSinMotivo = await req('POST', `/api/tareas/${t3.id}/cancelar`, cookie, {
      desde: 'PENDIENTE',
      comentario: '   ',
    });
    expect(resCancSinMotivo.status).toBe(400);

    const resCancOk = await req('POST', `/api/tareas/${t3.id}/cancelar`, cookie, {
      desde: 'PENDIENTE',
      comentario: 'Cancelado por cambio de especificación',
    });
    expect(resCancOk.status).toBe(200);

    // 7. Bloquear agregar tareas a una OT finalizada
    await req('POST', `/api/comercial/ot/${ot.id}/transicionar`, cookie, { desde: 'PENDIENTE', a: 'CANCELADO', comentario: 'Fin' });
    const resAddEnFinal = await req('POST', `/api/comercial/ot/${ot.id}/tareas`, cookie, {
      tipo: 'OTRO',
      descripcion: 'No permitida',
    });
    expect(resAddEnFinal.status).toBe(400);

    // 8. Bloquear editar una tarea finalizada (CANCELADA)
    const t3Cancelada = await (await req('GET', `/api/comercial/ot/${ot.id}/tareas`, cookie)).json();
    const t3Item = t3Cancelada.find((x: { id: string }) => x.id === t3.id);
    const resEditCancelada = await req('PATCH', `/api/tareas/${t3.id}`, cookie, {
      descripcion: 'No permitida',
      updatedAt: t3Item.updated_at,
    });
    expect(resEditCancelada.status).toBe(400);
  });
});
