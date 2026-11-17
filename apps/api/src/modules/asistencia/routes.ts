import { Hono, type Context } from 'hono';
import { marcarAsistenciaSchema, marcarCuadrillaSchema, filtroAsistenciaSchema } from '@afull/shared';
import { insertarMarcacion, ubicar } from './service.js';
import { cuadrillasDeHoy, marcarCuadrilla } from './cuadrilla.service.js';
import { publicarLive } from '../live/publicar.js';
import { sql } from '../../db/client.js';
import { requireSesion, requireCapacidad } from '../auth/middleware.js';
import { auditar } from '../auditoria/service.js';
import { ipDe } from '../../lib/ip.js';
import { TAM_PAGINA, desplazamiento, armarPagina, escaparLike } from '../../lib/paginacion.js';
import { personaDeSesion, enTx, horaDeAccion } from '../campo/comun.js';

/**
 * Marcación de asistencia. La geocerca es DISUASIVA: fuera del radio se guarda igual con
 * dentro_geocerca = false (el GPS del navegador es falsificable; bloquear dejaría gente sin marcar).
 */
export const asistenciaRoutes = new Hono()
  .use('*', requireSesion)
  .post('/marcar', async (c: Context) => {
    const d = marcarAsistenciaSchema.parse(await c.req.json().catch(() => null));
    const usuarioId = c.get('usuario').id as string;
    const r = await enTx(async (tx) => {
      const persona = await personaDeSesion(tx, usuarioId);
      const [previa] = await tx`
        SELECT id, tipo, dentro_geocerca, distancia_m::float8 AS distancia_m FROM marcacion_asistencia
        WHERE clave_idempotencia = ${d.claveIdempotencia}
      `;
      if (previa) return { ...previa, repetida: true };
      const h = await horaDeAccion(tx, d.ocurridaAt);
      const u = await ubicar(tx, { lat: d.gpsLat, lng: d.gpsLng }, d.motivoRemoto, h.sinSenal);
      const m = await insertarMarcacion(tx, {
        personaId: persona.id, tipo: d.tipo, gps: { lat: d.gpsLat, lng: d.gpsLng }, precisionM: d.precisionM, ip: ipDe(c) ?? null,
        dispositivoHash: d.dispositivoHash, clave: d.claveIdempotencia, hora: h.hora, sinSenal: h.sinSenal, u, origen: u.motivoRemoto ? 'REMOTO' : 'PROPIA',
      });
      await auditar(
        { usuarioId, accion: 'asistencia.marcar', recurso: 'marcacion_asistencia', recursoId: m.id, ip: ipDe(c), metadata: { tipo: d.tipo, dentro: m.dentro_geocerca } },
        tx
      );
      return { ...m, sede: u.sede, repetida: false };
    });
    if (!r.repetida) await publicarLive('asistencia.marcar', String((r as { id?: unknown }).id ?? '')); // panel de Gerardo (Loop 14)
    return c.json(r, r.repetida ? 200 : 201);
  })
  .get('/cuadrilla', async (c) => c.json({ salidas: await cuadrillasDeHoy(c.get('usuario').id as string) }))
  .post('/cuadrilla', async (c: Context) => {
    const d = marcarCuadrillaSchema.parse(await c.req.json().catch(() => null));
    const r = await marcarCuadrilla({ usuarioId: c.get('usuario').id as string, ip: ipDe(c) ?? null }, d);
    const nuevas = r.marcadas.filter((m) => !m.repetida);
    if (nuevas.length) await publicarLive('asistencia.cuadrilla', d.hojaRutaId);
    return c.json(r, nuevas.length ? 201 : 200);
  })
  .get('/', requireCapacidad('rrhh'), async (c) => {
    const f = filtroAsistenciaSchema.parse(c.req.query());
    const donde = sql`WHERE ${true}
      ${f.personaId ? sql`AND m.persona_id = ${f.personaId}` : sql``}
      ${f.q?.trim() ? sql`AND p.nombre ILIKE ${'%' + escaparLike(f.q.trim()) + '%'}` : sql``}
      ${f.soloFuera === 'true' ? sql`AND NOT m.dentro_geocerca` : sql``}
      ${f.desde ? sql`AND m.marcada_at >= (${f.desde}::date)::timestamp AT TIME ZONE 'America/Asuncion'` : sql``}
      ${f.hasta ? sql`AND m.marcada_at < ((${f.hasta}::date + 1)::timestamp AT TIME ZONE 'America/Asuncion')` : sql``}`;
    const [{ total }] = await sql`SELECT count(*)::int AS total FROM marcacion_asistencia m JOIN persona p ON p.id = m.persona_id ${donde}`;
    const items = await sql`
      SELECT m.id, m.persona_id, p.nombre AS persona_nombre, m.tipo, m.marcada_at, m.dentro_geocerca,
             m.distancia_m::float8 AS distancia_m, m.precision_m::float8 AS precision_m, s.nombre AS sede_nombre, m.dispositivo_hash,
             m.sin_senal, m.recibida_at, m.origen, m.motivo_remoto, coalesce(pm.nombre, um.username) AS marcada_por_nombre
      FROM marcacion_asistencia m JOIN persona p ON p.id = m.persona_id LEFT JOIN sede s ON s.id = m.sede_id
      LEFT JOIN usuario um ON um.id = m.marcada_por LEFT JOIN persona pm ON pm.id = um.persona_id
      ${donde} ORDER BY m.marcada_at DESC LIMIT ${TAM_PAGINA} OFFSET ${desplazamiento(f.pagina)}
    `;
    return c.json(armarPagina([...items], total, f.pagina));
  });
