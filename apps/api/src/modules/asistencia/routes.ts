import { Hono, type Context } from 'hono';
import { evaluarGeocerca, marcarAsistenciaSchema, filtroAsistenciaSchema } from '@afull/shared';
import { sql } from '../../db/client.js';
import { requireSesion, requireCapacidad } from '../auth/middleware.js';
import { auditar } from '../auditoria/service.js';
import { ipDe } from '../../lib/ip.js';
import { TAM_PAGINA, desplazamiento, armarPagina } from '../../lib/paginacion.js';
import { personaDeSesion, enTx } from '../campo/comun.js';

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
      const sedes = await tx<{ id: string; nombre: string; lat: number; lng: number; radio_m: number }[]>`
        SELECT id, nombre, gps_lat::float8 AS lat, gps_lng::float8 AS lng, radio_m FROM sede WHERE activo
      `;
      const evaluadas = sedes
        .map((s) => ({ s, ...evaluarGeocerca({ lat: d.gpsLat, lng: d.gpsLng }, s, s.radio_m) }))
        .sort((a, b) => a.distanciaM - b.distanciaM);
      const mejor = evaluadas[0] ?? null;
      const [m] = await tx`
        INSERT INTO marcacion_asistencia
          (persona_id, sede_id, tipo, gps_lat, gps_lng, precision_m, distancia_m, dentro_geocerca, ip, dispositivo_hash, clave_idempotencia)
        VALUES (${persona.id}, ${mejor?.s.id ?? null}, ${d.tipo}, ${d.gpsLat}, ${d.gpsLng}, ${d.precisionM ?? null},
                ${mejor?.distanciaM ?? null}, ${mejor?.dentro ?? false}, ${ipDe(c) ?? null}, ${d.dispositivoHash.toLowerCase()}, ${d.claveIdempotencia})
        RETURNING id, tipo, marcada_at, dentro_geocerca, distancia_m::float8 AS distancia_m
      `;
      await auditar(
        { usuarioId, accion: 'asistencia.marcar', recurso: 'marcacion_asistencia', recursoId: m.id, ip: ipDe(c), metadata: { tipo: d.tipo, dentro: m.dentro_geocerca } },
        tx
      );
      return { ...m, sede: mejor?.s.nombre ?? null, repetida: false };
    });
    return c.json(r, r.repetida ? 200 : 201);
  })
  .get('/', requireCapacidad('rrhh'), async (c) => {
    const f = filtroAsistenciaSchema.parse(c.req.query());
    const donde = sql`WHERE ${true}
      ${f.personaId ? sql`AND m.persona_id = ${f.personaId}` : sql``}
      ${f.soloFuera === 'true' ? sql`AND NOT m.dentro_geocerca` : sql``}
      ${f.desde ? sql`AND m.marcada_at >= (${f.desde}::date)::timestamp AT TIME ZONE 'America/Asuncion'` : sql``}
      ${f.hasta ? sql`AND m.marcada_at < ((${f.hasta}::date + 1)::timestamp AT TIME ZONE 'America/Asuncion')` : sql``}`;
    const [{ total }] = await sql`SELECT count(*)::int AS total FROM marcacion_asistencia m ${donde}`;
    const items = await sql`
      SELECT m.id, m.persona_id, p.nombre AS persona_nombre, m.tipo, m.marcada_at, m.dentro_geocerca,
             m.distancia_m::float8 AS distancia_m, m.precision_m::float8 AS precision_m, s.nombre AS sede_nombre, m.dispositivo_hash
      FROM marcacion_asistencia m JOIN persona p ON p.id = m.persona_id LEFT JOIN sede s ON s.id = m.sede_id
      ${donde} ORDER BY m.marcada_at DESC LIMIT ${TAM_PAGINA} OFFSET ${desplazamiento(f.pagina)}
    `;
    return c.json(armarPagina([...items], total, f.pagina));
  });
