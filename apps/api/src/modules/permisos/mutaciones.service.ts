import type { TransactionSql } from 'postgres';
import { puedeTransicionarPermiso, type EstadoPermiso, type NuevaSolicitudPermiso } from '@afull/shared';
import { sql } from '../../db/client.js';
import { auditar } from '../auditoria/service.js';
import { ErrorApp, traducirErrorPg } from '../../lib/errores.js';

export type CtxPermiso = { usuarioId: string; ip?: string; capacidades: string[] };
const tiene = (ctx: CtxPermiso, cap: string) => ctx.capacidades.includes('admin') || ctx.capacidades.includes(cap);

async function enTx<T>(fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
  try {
    return (await sql.begin(fn)) as T;
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}

async function personaDelUsuario(tx: TransactionSql, usuarioId: string) {
  const [u] = await tx<{ persona_id: string | null }[]>`SELECT persona_id FROM usuario WHERE id = ${usuarioId}`;
  return u?.persona_id ?? null;
}

/** Nueva solicitud: la persona para sí misma, o RR.HH. a nombre de otra (formulario en papel). Idempotente. */
export async function crearSolicitud(ctx: CtxPermiso, d: NuevaSolicitudPermiso) {
  return enTx(async (tx) => {
    const [previa] = await tx`SELECT id, numero FROM solicitud_permiso WHERE clave_idempotencia = ${d.claveIdempotencia}`;
    if (previa) return { id: previa.id as string, numero: previa.numero as string, repetida: true };
    let personaId = await personaDelUsuario(tx, ctx.usuarioId);
    if (d.personaId && d.personaId !== personaId) {
      if (!tiene(ctx, 'rrhh')) throw new ErrorApp(403, 'Solo RR.HH. puede cargar una solicitud a nombre de otra persona');
      personaId = d.personaId;
    }
    if (!personaId) throw new ErrorApp(403, 'Tu usuario no está vinculado a una persona');
    const [p] = await tx`SELECT activo FROM persona WHERE id = ${personaId}`;
    if (!p?.activo) throw new ErrorApp(400, 'Persona inexistente o inactiva');
    const anio = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion', year: 'numeric' }).format(new Date());
    const [{ v }] = await tx`SELECT siguiente_valor(${'PER-' + anio}) AS v`;
    const numero = `PER-${anio}-${String(v).padStart(4, '0')}`;
    const fechaHasta = d.modalidad === 'HORAS' ? d.fechaDesde : d.fechaHasta!;
    const [s] = await tx`
      INSERT INTO solicitud_permiso (numero, persona_id, tipo, detalle_tipo, motivo, modalidad, fecha_desde, fecha_hasta, hora_desde, hora_hasta,
                                     comprobante_url, fuera_de_plazo, cargado_por, clave_idempotencia)
      VALUES (${numero}, ${personaId}, ${d.tipo}, ${d.detalleTipo ?? null}, ${d.motivo}, ${d.modalidad}, ${d.fechaDesde}, ${fechaHasta},
              ${d.horaDesde ?? null}, ${d.horaHasta ?? null}, ${d.comprobanteUrl ?? null},
              -- "Dentro de las 24 h del usufructo": se marca, no se bloquea.
              clock_timestamp() > ((${d.fechaDesde}::date + coalesce(${d.horaDesde ?? null}::time, '00:00'::time)) AT TIME ZONE 'America/Asuncion') + interval '24 hours',
              ${ctx.usuarioId}, ${d.claveIdempotencia})
      RETURNING id, numero, fuera_de_plazo
    `;
    await tx`INSERT INTO solicitud_permiso_evento (solicitud_id, estado_anterior, estado_nuevo, autor_id) VALUES (${s.id}, NULL, 'PENDIENTE', ${ctx.usuarioId})`;
    await auditar({ usuarioId: ctx.usuarioId, accion: 'permiso.crear', recurso: 'solicitud_permiso', recursoId: s.id, ip: ctx.ip, metadata: { numero, tipo: d.tipo } }, tx);
    return { id: s.id as string, numero: s.numero as string, fuera_de_plazo: s.fuera_de_plazo as boolean, repetida: false };
  });
}

export type TransicionPermiso = { desde: EstadoPermiso; a: 'AUTORIZADA' | 'REGISTRADA' | 'RECHAZADA' | 'ANULADA'; comentario?: string; conDescuento?: boolean };

/**
 * Firmas del formulario: el jefe inmediato (admin) autoriza; RR.HH. registra con descuento sí/no.
 * Rechazar: admin o RR.HH., con motivo. Anular: solo quien la pidió (o quien la cargó), mientras está pendiente.
 */
export async function transicionarSolicitud(ctx: CtxPermiso, id: string, t: TransicionPermiso) {
  return enTx(async (tx) => {
    const [s] = await tx`SELECT id, estado, persona_id, cargado_por FROM solicitud_permiso WHERE id = ${id} FOR UPDATE`;
    if (!s) throw new ErrorApp(404, 'Solicitud no encontrada');
    if (s.estado !== t.desde) throw new ErrorApp(409, `La solicitud ya está ${String(s.estado).toLowerCase()}; recargá los datos`);
    if (!puedeTransicionarPermiso(s.estado, t.a)) throw new ErrorApp(400, `No se puede pasar de ${s.estado} a ${t.a}`);
    if (t.a === 'AUTORIZADA' && !tiene(ctx, 'admin')) throw new ErrorApp(403, 'Autoriza el jefe inmediato');
    if (t.a === 'REGISTRADA' && !tiene(ctx, 'rrhh')) throw new ErrorApp(403, 'Registra RR.HH.');
    if (t.a === 'RECHAZADA' && !tiene(ctx, 'rrhh')) throw new ErrorApp(403, 'Rechaza el jefe o RR.HH.');
    if (t.a === 'ANULADA') {
      const propia = s.cargado_por === ctx.usuarioId || s.persona_id === (await personaDelUsuario(tx, ctx.usuarioId));
      if (!propia) throw new ErrorApp(403, 'Solo quien pidió el permiso puede anularlo');
    }
    const descuento = t.a === 'REGISTRADA' ? Boolean(t.conDescuento) : null;
    await tx`UPDATE solicitud_permiso SET estado = ${t.a}, con_descuento = ${descuento} WHERE id = ${id}`;
    await tx`
      INSERT INTO solicitud_permiso_evento (solicitud_id, estado_anterior, estado_nuevo, con_descuento, comentario, autor_id)
      VALUES (${id}, ${s.estado}, ${t.a}, ${descuento}, ${t.comentario?.trim() || null}, ${ctx.usuarioId})
    `;
    await auditar({ usuarioId: ctx.usuarioId, accion: 'permiso.cambio_estado', recurso: 'solicitud_permiso', recursoId: id, ip: ctx.ip, metadata: { de: s.estado, a: t.a } }, tx);
    return { id, estado: t.a };
  });
}
