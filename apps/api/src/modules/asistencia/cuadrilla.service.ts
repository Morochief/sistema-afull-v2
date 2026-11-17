import type { MarcarCuadrilla } from '@afull/shared';
import { sql } from '../../db/client.js';
import { auditar } from '../auditoria/service.js';
import { ErrorApp } from '../../lib/errores.js';
import { enTx, horaDeAccion, personaDeSesion } from '../campo/comun.js';
import { insertarMarcacion, ubicar } from './service.js';

const TZ = 'America/Asuncion';
type Resultado = { marcadas: { personaId: string; id: string; repetida: boolean }[]; rechazadas: { personaId: string; motivo: string }[] };

/**
 * Loop 16: el conductor marca por la cuadrilla de SU salida del día (fecha de Asunción de la marcación). Por persona:
 * ENTRADA si hoy no está adentro, SALIDA si está adentro; lo que no cumple se rechaza con el motivo y el resto se marca.
 * Candado por persona: si alguien marca desde su celular al mismo tiempo, no se duplica.
 */
export async function marcarCuadrilla(ctx: { usuarioId: string; ip: string | null }, d: MarcarCuadrilla): Promise<Resultado> {
  return enTx(async (tx) => {
    const conductor = await personaDeSesion(tx, ctx.usuarioId);
    const h = await horaDeAccion(tx, d.ocurridaAt);
    const ref = h.hora ?? new Date();
    const [hoja] = await tx`
      SELECT 1 FROM hoja_ruta hr JOIN hoja_ruta_persona hp ON hp.hoja_ruta_id = hr.id
      WHERE hr.id = ${d.hojaRutaId} AND hp.persona_id = ${conductor.id} AND hp.rol = 'CONDUCTOR' AND hp.activo
        AND hr.fecha = (${ref}::timestamptz AT TIME ZONE ${TZ})::date`;
    if (!hoja) throw new ErrorApp(403, 'Solo el conductor de esta salida, el mismo día, puede marcar por la cuadrilla');
    const u = await ubicar(tx, { lat: d.gpsLat, lng: d.gpsLng }, d.motivoRemoto, h.sinSenal);
    const miembros = new Set((await tx<{ persona_id: string }[]>`
      SELECT persona_id FROM hoja_ruta_persona WHERE hoja_ruta_id = ${d.hojaRutaId} AND activo`).map((m) => m.persona_id));
    const r: Resultado = { marcadas: [], rechazadas: [] };
    const vistas = new Set<string>();
    for (const p of d.personas) {
      if (vistas.has(p.personaId)) continue;
      vistas.add(p.personaId);
      const [previa] = await tx<{ id: string }[]>`SELECT id FROM marcacion_asistencia WHERE clave_idempotencia = ${p.claveIdempotencia}`;
      if (previa) { r.marcadas.push({ personaId: p.personaId, id: previa.id, repetida: true }); continue; }
      if (!miembros.has(p.personaId)) { r.rechazadas.push({ personaId: p.personaId, motivo: 'no está en esta salida' }); continue; }
      await tx`SELECT pg_advisory_xact_lock(hashtext(${'asistencia:' + p.personaId}))`;
      const [ultima] = await tx<{ tipo: string }[]>`
        SELECT tipo FROM marcacion_asistencia
        WHERE persona_id = ${p.personaId} AND marcada_at <= ${ref}::timestamptz
          AND marcada_at >= (date_trunc('day', ${ref}::timestamptz AT TIME ZONE ${TZ}) AT TIME ZONE ${TZ})
        ORDER BY marcada_at DESC LIMIT 1`;
      const adentro = ultima?.tipo === 'ENTRADA';
      if (d.tipo === 'ENTRADA' && adentro) { r.rechazadas.push({ personaId: p.personaId, motivo: 'ya marcó entrada hoy' }); continue; }
      if (d.tipo === 'SALIDA' && !adentro) { r.rechazadas.push({ personaId: p.personaId, motivo: 'no marcó entrada hoy' }); continue; }
      const m = await insertarMarcacion(tx, {
        personaId: p.personaId, tipo: d.tipo, gps: { lat: d.gpsLat, lng: d.gpsLng }, precisionM: d.precisionM, ip: ctx.ip, dispositivoHash: d.dispositivoHash,
        clave: p.claveIdempotencia, hora: h.hora, sinSenal: h.sinSenal, u, origen: 'CUADRILLA', marcadaPor: ctx.usuarioId, hojaRutaId: d.hojaRutaId,
      });
      await auditar({ usuarioId: ctx.usuarioId, accion: 'asistencia.cuadrilla', recurso: 'marcacion_asistencia', recursoId: m.id, ip: ctx.ip ?? undefined,
        metadata: { tipo: d.tipo, personaId: p.personaId, hojaRutaId: d.hojaRutaId, dentro: m.dentro_geocerca } }, tx);
      r.marcadas.push({ personaId: p.personaId, id: m.id, repetida: false });
    }
    return r;
  });
}

export type CuadrillaHoy = {
  hoja_ruta_id: string; descripcion: string | null; vehiculo: string | null;
  personas: { persona_id: string; nombre: string; rol: string; ultima_tipo: 'ENTRADA' | 'SALIDA' | null; ultima_at: string | null }[];
};

/** Las salidas de hoy donde el usuario es conductor, con la última marcación de hoy de cada uno (para los tildes). */
export async function cuadrillasDeHoy(usuarioId: string): Promise<CuadrillaHoy[]> {
  const [u] = await sql<{ persona_id: string | null }[]>`SELECT persona_id FROM usuario WHERE id = ${usuarioId}`;
  if (!u?.persona_id) return [];
  const hojas = await sql<{ id: string; descripcion: string | null; vehiculo: string | null }[]>`
    SELECT hr.id, hr.descripcion, v.chapa AS vehiculo FROM hoja_ruta hr
    JOIN hoja_ruta_persona hp ON hp.hoja_ruta_id = hr.id AND hp.persona_id = ${u.persona_id} AND hp.rol = 'CONDUCTOR' AND hp.activo
    LEFT JOIN vehiculo v ON v.id = hr.vehiculo_id
    WHERE hr.fecha = (now() AT TIME ZONE ${TZ})::date ORDER BY hr.created_at`;
  const salidas: CuadrillaHoy[] = [];
  for (const h of hojas) {
    const personas = await sql<CuadrillaHoy['personas']>`
      SELECT p.id AS persona_id, p.nombre, hp.rol, m.tipo AS ultima_tipo, m.marcada_at AS ultima_at
      FROM hoja_ruta_persona hp JOIN persona p ON p.id = hp.persona_id
      LEFT JOIN LATERAL (
        SELECT x.tipo, x.marcada_at FROM marcacion_asistencia x
        WHERE x.persona_id = p.id AND x.marcada_at >= (date_trunc('day', now() AT TIME ZONE ${TZ}) AT TIME ZONE ${TZ})
        ORDER BY x.marcada_at DESC LIMIT 1) m ON true
      WHERE hp.hoja_ruta_id = ${h.id} AND hp.activo
      ORDER BY (hp.rol = 'CONDUCTOR') DESC, p.nombre`;
    salidas.push({ hoja_ruta_id: h.id, descripcion: h.descripcion, vehiculo: h.vehiculo, personas: [...personas] });
  }
  return salidas;
}
