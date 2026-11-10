import { describe, it, expect, afterAll } from 'vitest';
import { admin, cerrarConexiones } from '../loop0/helpers.js';
import { sesion, ok, hoyAsuncion, clienteConLocal, nuevaOT, operario, type Sesion } from '../loop10/escenario.js';

afterAll(async () => {
  await admin`UPDATE tarea_intervalo SET hora_fin = greatest(clock_timestamp(), hora_inicio), motivo_cierre = 'FIN'
              WHERE hora_fin IS NULL AND persona_id IN (SELECT id FROM persona WHERE nombre LIKE 'zz_test_Op11%')`;
  await cerrarConexiones();
});

type Tarea = { id: string; descripcion: string; fecha_trabajo: string | null; cantidad: number | null; unidad: string | null; minutos_estimados: number | null; updated_at: string };
const miTrabajo = async (s: Sesion) => (await ok(s, 'GET', '/api/mi-trabajo')).tareas as Tarea[];
const hoja = (s: Sesion, otId: string, accion: string, desde: string) => s('POST', `/api/comercial/ot/${otId}/hoja`, { accion, desde });

async function escenario(tag: string) {
  const juan = await sesion(['admin']);
  const cli = await clienteConLocal(juan, tag);
  const op = await operario(juan, ['taller'], `11${tag}`);
  return { juan, cli, op };
}

describe('Loop 11 — Hoja de ruta de la OT', () => {
  it('CA-11.1 y CA-11.2: nace en BORRADOR; el operario no ve ni puede iniciar sus tareas hasta activarla', async () => {
    const tag = crypto.randomUUID().slice(0, 6);
    const e = await escenario(tag);
    const ot = await nuevaOT(e.juan, e.cli, `zz_test hoja ${tag}`);
    expect((await ok(e.juan, 'GET', `/api/comercial/ot/${ot.id}`)).hoja_estado).toBe('BORRADOR');
    const t = await ok(e.juan, 'POST', `/api/comercial/ot/${ot.id}/tareas`, {
      tipo: 'TALLER_IMPRESION', descripcion: 'Imprimir lona 3x1', personaAsignadaId: e.op.personaId,
      fechaTrabajo: hoyAsuncion(), cantidad: 3, unidad: 'm2', minutosEstimados: 90,
    });
    expect((await miTrabajo(e.op.s)).find((x) => x.id === t.id)).toBeUndefined();
    expect((await e.op.s('POST', `/api/mi-trabajo/tareas/${t.id}/iniciar`, { claveIdempotencia: crypto.randomUUID() })).status).toBe(409);

    expect((await hoja(e.juan, ot.id, 'ACTIVAR', 'BORRADOR')).status).toBe(200);
    expect(await miTrabajo(e.op.s)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: t.id, fecha_trabajo: hoyAsuncion(), cantidad: 3, unidad: 'm2', minutos_estimados: 90 }),
    ]));
    expect((await e.op.s('POST', `/api/mi-trabajo/tareas/${t.id}/iniciar`, { claveIdempotencia: crypto.randomUUID() })).status).toBe(201);

    const urgente = await nuevaOT(e.juan, e.cli, `zz_test urgente ${tag}`, { activarHoja: true });
    expect((await ok(e.juan, 'GET', `/api/comercial/ot/${urgente.id}`)).hoja_estado).toBe('ACTIVA');
  });

  it('CA-11.3: el WhatsApp sale con el formato de siempre, agrupado por operario, y activa la hoja', async () => {
    const tag = crypto.randomUUID().slice(0, 6);
    const e = await escenario(tag);
    const ot = await nuevaOT(e.juan, e.cli, `Cartel ${tag}`);
    await ok(e.juan, 'PATCH', `/api/comercial/ot/${ot.id}/hoja`, { notas: 'Entrar por el portón de atrás' });
    const tarea = (d: Record<string, unknown>) => ok(e.juan, 'POST', `/api/comercial/ot/${ot.id}/tareas`, { tipo: 'TALLER_IMPRESION', ...d });
    await tarea({ descripcion: 'Imprimir lona', personaAsignadaId: e.op.personaId, cantidad: 3, unidad: 'm2', fechaTrabajo: '2030-03-05', minutosEstimados: 90 });
    await tarea({ descripcion: 'Cortar vinilo', personaAsignadaId: e.op.personaId, fechaTrabajo: '2030-03-06', minutosEstimados: 45 });
    await tarea({ tipo: 'MONTAJE_CALLE', descripcion: 'Colocar en el frente' });
    const cancelada = await tarea({ descripcion: 'No va', personaAsignadaId: e.op.personaId });
    await ok(e.juan, 'POST', `/api/tareas/${cancelada.id}/cancelar`, { desde: 'PENDIENTE', comentario: 'zz_test' });

    const r = await ok(e.juan, 'POST', `/api/comercial/ot/${ot.id}/hoja/whatsapp`);
    expect(r.estado).toBe('ACTIVA');
    const op = (await ok(e.juan, 'GET', `/api/comercial/ot/${ot.id}`)) as { codigo_ot: string };
    expect(r.mensaje).toBe([
      `*Hoja de Ruta — zz_test_cli10_${tag}*`,
      `OT: ${op.codigo_ot} · Cartel ${tag}`,
      'Local: Local',
      'Fecha: 05/03/2030',
      '',
      'Entrar por el portón de atrás',
      '',
      `⛔zz_test_Op10 11${tag}⛔`,
      'Imprimir lona (Cant: 3 m2) · 05/03 · ~1 h 30 min',
      'Cortar vinilo · 06/03 · ~45 min',
      '',
      '⛔Sin asignar⛔',
      'Colocar en el frente',
    ].join('\n'));
    expect((await ok(e.juan, 'GET', `/api/comercial/ot/${ot.id}`)).hoja_estado).toBe('ACTIVA');
  });

  it('CA-11.4: no cierra con tareas abiertas; cierra, bloquea altas, reabre; desde viejo 409', async () => {
    const tag = crypto.randomUUID().slice(0, 6);
    const e = await escenario(tag);
    const ot = await nuevaOT(e.juan, e.cli, `zz_test cierre ${tag}`, { activarHoja: true });
    const t = await ok(e.juan, 'POST', `/api/comercial/ot/${ot.id}/tareas`, { tipo: 'TALLER_CORTE', descripcion: 'Cortar', personaAsignadaId: e.op.personaId });
    expect((await hoja(e.juan, ot.id, 'CERRAR', 'ACTIVA')).status).toBe(409);
    await ok(e.juan, 'POST', `/api/tareas/${t.id}/cancelar`, { desde: 'PENDIENTE', comentario: 'zz_test' });
    expect((await hoja(e.juan, ot.id, 'CERRAR', 'BORRADOR')).status).toBe(409);
    expect((await hoja(e.juan, ot.id, 'CERRAR', 'ACTIVA')).status).toBe(200);
    expect((await e.juan('POST', `/api/comercial/ot/${ot.id}/tareas`, { tipo: 'TALLER_CORTE', descripcion: 'Otra' })).status).toBe(400);
    expect((await hoja(e.juan, ot.id, 'REABRIR', 'CERRADA')).status).toBe(200);
    expect((await ok(e.juan, 'GET', `/api/comercial/ot/${ot.id}`)).hoja_estado).toBe('ACTIVA');
  });

  it('CA-11.5: el taller no toca la hoja; se editan los datos de la tarea; datos inválidos 400', async () => {
    const tag = crypto.randomUUID().slice(0, 6);
    const e = await escenario(tag);
    const ot = await nuevaOT(e.juan, e.cli, `zz_test edicion ${tag}`);
    expect((await hoja(e.op.s, ot.id, 'ACTIVAR', 'BORRADOR')).status).toBe(403);
    expect((await e.juan('POST', `/api/comercial/ot/${ot.id}/tareas`, { tipo: 'TALLER_CORTE', descripcion: 'X', cantidad: -1 })).status).toBe(400);
    const t = await ok(e.juan, 'POST', `/api/comercial/ot/${ot.id}/tareas`, { tipo: 'TALLER_CORTE', descripcion: 'Cortar letras' });
    const ed = await ok(e.juan, 'PATCH', `/api/tareas/${t.id}`, { fechaTrabajo: '2030-04-01', cantidad: 12, unidad: 'u', minutosEstimados: 30, updatedAt: t.updated_at });
    expect(ed).toMatchObject({ fecha_trabajo: '2030-04-01', cantidad: 12, unidad: 'u', minutos_estimados: 30 });
    const lista = (await ok(e.juan, 'GET', `/api/comercial/ot/${ot.id}/tareas`)) as unknown as Tarea[];
    expect(lista.find((x) => x.id === t.id)).toMatchObject({ fecha_trabajo: '2030-04-01', cantidad: 12 });
    expect((await ok(e.juan, 'GET', `/api/comercial/ot/${ot.id}`)).hoja_notas ?? null).toBeNull();
  });
});
