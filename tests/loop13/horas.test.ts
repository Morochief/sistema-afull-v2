import { describe, it, expect, afterAll } from 'vitest';
import { admin, cerrarConexiones } from '../loop0/helpers.js';
import { sesion } from '../loop3/helpers-comercial.js';

/** Loop 13 — corregir y cargar horas a mano (docs/LOOP_13_CORREGIR_HORAS_DISENO.md). */
const personas: string[] = [];
afterAll(async () => {
  await admin`UPDATE tarea_intervalo SET hora_fin = greatest(clock_timestamp(), hora_inicio), motivo_cierre = 'FIN'
              WHERE hora_fin IS NULL AND persona_id = ANY(${personas}::uuid[])`;
  await admin`UPDATE persona SET activo = false WHERE id = ANY(${personas}::uuid[])`;
  await cerrarConexiones();
});
const uuid = () => crypto.randomUUID();
/** Fecha (Asunción) de hace n días, para armar horas fijas: `${dia(1)}T08:00:00-03:00`. */
const dia = (n: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(new Date(Date.now() - n * 86_400_000));
const h = (n: number, hora: string) => `${dia(n)}T${hora}:00-03:00`;

async function escenario() {
  const tag = uuid().slice(0, 8);
  const juan = await sesion(['admin']);
  const sofi = await sesion(['rrhh']);
  const edu = await sesion(['taller']);
  const [p] = await admin`INSERT INTO persona (nombre, ci) VALUES (${'zz_test_edu13_' + tag}, ${'H13' + tag}) RETURNING id`;
  personas.push(p.id as string);
  await admin`UPDATE usuario SET persona_id = ${p.id} WHERE id = ${edu.usuarioId}`;
  await admin`INSERT INTO tarifa_persona (persona_id, tarifa_hora_gs, fecha_inicio) VALUES (${p.id}, 21000, '2026-01-01')`;
  const [c] = await admin`INSERT INTO cliente (codigo, nombre) VALUES (${'Z13' + tag}, ${'zz_test_cli13_' + tag}) RETURNING id`;
  const [ot] = await admin`INSERT INTO orden_trabajo (codigo_ot, cliente_id, titulo, creado_por) VALUES (${'OT13-' + tag}, ${c.id}, 'zz_test lona', ${juan.usuarioId}) RETURNING id`;
  const [t] = await admin`INSERT INTO tarea (orden_trabajo_id, persona_asignada_id, tipo, descripcion, orden_secuencia, estado, creado_por)
                          VALUES (${ot.id}, ${p.id}, 'TALLER_IMPRESION', 'zz_test imprimir', 1, 'PENDIENTE', ${juan.usuarioId}) RETURNING id`;
  const tramo = async (inicio: string, fin: string | null) => {
    const [i] = await admin`INSERT INTO tarea_intervalo (tarea_id, persona_id, hora_inicio, hora_fin, motivo_cierre, clave_idempotencia)
                            VALUES (${t.id}, ${p.id}, ${inicio}, ${fin}, ${fin ? 'PAUSA' : null}, ${uuid()}) RETURNING id`;
    if (!fin) await admin`UPDATE tarea SET estado = 'EN_CURSO' WHERE id = ${t.id}`;
    return i.id as string;
  };
  const costo = async () => ((await juan('GET', `/api/costeo/ot/${ot.id}`)).j as { mano_obra_gs: number }).mano_obra_gs;
  return { juan, sofi, edu, persona: p.id as string, ot: ot.id as string, tarea: t.id as string, tramo, costo };
}

describe('Loop 13 — corregir y cargar horas a mano', () => {
  it('CA-13.1: cerrar con hora un reloj olvidado: el costo usa esa hora, la tarea queda pausada y se audita', async () => {
    const e = await escenario();
    const id = await e.tramo(h(1, '08:00'), null);
    const r = await e.juan('POST', `/api/horas/${id}/cerrar`, { horaFin: h(1, '09:00'), motivo: 'Se olvidó de pausar al irse' });
    expect(r.status).toBe(200);
    expect(await e.costo()).toBe(21000);
    const [t] = await admin`SELECT estado FROM tarea WHERE id = ${e.tarea}`;
    expect(t.estado).toBe('PAUSADA');
    const [i] = await admin`SELECT motivo_cierre, cerrado_por, motivo_correccion FROM tarea_intervalo WHERE id = ${id}`;
    expect([i.motivo_cierre, i.cerrado_por, i.motivo_correccion]).toEqual(['CORRECCION', e.juan.usuarioId, 'Se olvidó de pausar al irse']);
    const [a] = await admin`SELECT count(*)::int AS n FROM evento_auditoria WHERE accion = 'horas.cerrar' AND recurso_id = ${id}`;
    expect(a.n).toBe(1);
    expect((await e.juan('POST', `/api/horas/${id}/cerrar`, { horaFin: h(1, '09:00'), motivo: 'otra vez' })).status).toBe(409);
  });

  it('CA-13.2: corregir el fin de un tramo cerrado: baja el costo, el tramo original no cambia, una sola vez', async () => {
    const e = await escenario();
    const id = await e.tramo(h(1, '08:00'), h(1, '12:00'));
    expect(await e.costo()).toBe(84000);
    expect((await e.sofi('POST', `/api/horas/${id}/correccion`, { horaFin: h(1, '13:00'), motivo: 'alarga' })).status).toBe(400);
    expect((await e.sofi('POST', `/api/horas/${id}/correccion`, { horaFin: h(1, '07:00'), motivo: 'antes' })).status).toBe(400);
    expect((await e.sofi('POST', `/api/horas/${id}/correccion`, { horaFin: h(1, '10:00'), motivo: 'Paró a las 10 para almorzar' })).status).toBe(201);
    expect(await e.costo()).toBe(42000);
    const [i] = await admin`SELECT hora_fin FROM tarea_intervalo WHERE id = ${id}`;
    expect(new Date(i.hora_fin as string).toISOString()).toBe(new Date(h(1, '12:00')).toISOString());
    expect((await e.sofi('POST', `/api/horas/${id}/correccion`, { horaFin: h(1, '09:00'), motivo: 'de nuevo' })).status).toBe(409);
    // El reloj de Mi trabajo también usa la hora corregida.
    const mt = (await e.edu('GET', '/api/mi-trabajo')).j as { tareas: { id: string; segundos_acumulados: number }[] };
    expect(mt.tareas.find((t) => t.id === e.tarea)!.segundos_acumulados).toBe(7200);
  });

  it('CA-13.3: cargar horas a mano suma al costo y queda marcado "a mano" en el listado de la persona', async () => {
    const e = await escenario();
    const clave = uuid();
    const cuerpo = { tareaId: e.tarea, personaId: e.persona, horaInicio: h(2, '14:00'), horaFin: h(2, '16:00'), motivo: 'Trabajó sin celular', claveIdempotencia: clave };
    expect((await e.juan('POST', '/api/horas/manual', cuerpo)).status).toBe(201);
    expect((await e.juan('POST', '/api/horas/manual', cuerpo)).status).toBe(200);
    expect(await e.costo()).toBe(42000);
    const l = (await e.sofi('GET', `/api/personas/${e.persona}/horas?desde=${dia(5)}&hasta=${dia(0)}`)).j as { items: { origen: string; segundos: number; motivo_manual: string }[]; total: number };
    expect(l.total).toBe(1);
    expect(l.items[0]).toMatchObject({ origen: 'MANUAL', segundos: 7200, motivo_manual: 'Trabajó sin celular' });
    const tareas = (await e.sofi('GET', `/api/horas/persona/${e.persona}/tareas`)).j as unknown as { id: string }[];
    expect(tareas.map((t) => t.id)).toEqual([e.tarea]);
    expect((await e.edu('GET', `/api/horas/persona/${e.persona}/tareas`)).status).toBe(403);
  });

  it('el listado muestra la corrección con la hora original, quién y por qué', async () => {
    const e = await escenario();
    const id = await e.tramo(h(1, '08:00'), h(1, '12:00'));
    await e.juan('POST', `/api/horas/${id}/correccion`, { horaFin: h(1, '10:00'), motivo: 'Paró a las 10' });
    const l = (await e.sofi('GET', `/api/personas/${e.persona}/horas?desde=${dia(5)}&hasta=${dia(0)}`)).j as { items: Record<string, unknown>[] };
    expect(l.items[0]).toMatchObject({ id, segundos: 7200, motivo_correccion: 'Paró a las 10', ot_codigo: expect.stringContaining('OT13-') });
    expect(new Date(l.items[0].hora_fin_original as string).toISOString()).toBe(new Date(h(1, '12:00')).toISOString());
    expect(l.items[0].corregido_por).toBeTruthy();
  });

  it('CA-13.4: rechazos', async () => {
    const e = await escenario();
    await e.tramo(h(1, '08:00'), h(1, '12:00'));
    const manual = (extra: object) => e.juan('POST', '/api/horas/manual', { tareaId: e.tarea, personaId: e.persona, horaInicio: h(1, '14:00'), horaFin: h(1, '15:00'), motivo: 'Sin celular', claveIdempotencia: uuid(), ...extra });
    expect((await manual({ horaInicio: h(1, '11:00') })).status).toBe(409); // pisa el tramo de 8 a 12
    expect((await manual({ horaFin: h(1, '13:00') })).status).toBe(400); // fin antes del inicio
    expect((await manual({ motivo: '' })).status).toBe(400);
    expect((await manual({ horaInicio: h(40, '08:00'), horaFin: h(40, '09:00') })).status).toBe(400); // más de 31 días
    expect((await manual({ horaInicio: h(-1, '08:00'), horaFin: h(-1, '09:00') })).status).toBe(400); // futuro
    expect((await e.edu('POST', '/api/horas/manual', { tareaId: e.tarea, personaId: e.persona, horaInicio: h(1, '14:00'), horaFin: h(1, '15:00'), motivo: 'x', claveIdempotencia: uuid() })).status).toBe(403);
    const otra = await escenario();
    expect((await manual({ personaId: otra.persona })).status).toBe(400); // la tarea no es de esa persona
    await admin`UPDATE orden_trabajo SET estado = 'CANCELADO' WHERE id = ${e.ot}`;
    expect((await manual({})).status).toBe(409);
  });

  it('CA-13.5: las correcciones no se modifican ni se borran; los tramos a mano tampoco', async () => {
    const e = await escenario();
    const id = await e.tramo(h(1, '08:00'), h(1, '12:00'));
    await e.juan('POST', `/api/horas/${id}/correccion`, { horaFin: h(1, '10:00'), motivo: 'zz_test' });
    const [{ n }] = await admin`SELECT count(*)::int AS n FROM intervalo_correccion WHERE intervalo_id = ${id}`;
    expect(n).toBe(1);
    await expect(admin`UPDATE intervalo_correccion SET hora_fin_corregida = ${h(1, '11:00')} WHERE intervalo_id = ${id}`).rejects.toThrow();
    await expect(admin`DELETE FROM intervalo_correccion WHERE intervalo_id = ${id}`).rejects.toThrow();
    await expect(admin`INSERT INTO tarea_intervalo (tarea_id, persona_id, hora_inicio, hora_fin, clave_idempotencia, origen)
                       VALUES (${e.tarea}, ${e.persona}, ${h(3, '08:00')}, ${h(3, '09:00')}, ${uuid()}, 'MANUAL')`).rejects.toThrow(); // MANUAL sin quién ni motivo
  });
});
