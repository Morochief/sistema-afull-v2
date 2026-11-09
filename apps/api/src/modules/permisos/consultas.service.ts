import { sql } from '../../db/client.js';
import { ErrorApp } from '../../lib/errores.js';
import { TAM_PAGINA, desplazamiento, escaparLike, armarPagina } from '../../lib/paginacion.js';
import type { CtxPermiso } from './mutaciones.service.js';

type Filtro = { q?: string; estado?: string; desde?: string; hasta?: string; pagina: number };
const veTodas = (ctx: CtxPermiso) => ctx.capacidades.includes('admin') || ctx.capacidades.includes('rrhh');

const COLUMNAS = sql`
  s.id, s.numero, s.persona_id, p.nombre AS persona_nombre, s.tipo, s.detalle_tipo, s.motivo, s.modalidad,
  s.fecha_desde::text AS fecha_desde, s.fecha_hasta::text AS fecha_hasta, to_char(s.hora_desde, 'HH24:MI') AS hora_desde,
  to_char(s.hora_hasta, 'HH24:MI') AS hora_hasta, s.comprobante_url, s.fuera_de_plazo, s.estado, s.con_descuento,
  s.cargado_por, s.created_at, s.updated_at,
  (SELECT count(*)::int FROM archivo ar WHERE ar.solicitud_permiso_id = s.id AND ar.estado = 'SUBIDO') AS comprobantes`;

/** RR.HH. y el jefe ven todas; el resto solo las propias (como solicitante). 25 por página. */
export async function listarSolicitudes(ctx: CtxPermiso, f: Filtro) {
  const [u] = await sql`SELECT persona_id FROM usuario WHERE id = ${ctx.usuarioId}`;
  const patron = f.q?.trim() ? `%${escaparLike(f.q.trim())}%` : null;
  const donde = sql`WHERE ${true}
    ${veTodas(ctx) ? sql`` : sql`AND (s.persona_id = ${u?.persona_id ?? null} OR s.cargado_por = ${ctx.usuarioId})`}
    ${f.estado ? sql`AND s.estado = ${f.estado}` : sql``}
    ${patron ? sql`AND (s.numero ILIKE ${patron} OR p.nombre ILIKE ${patron} OR s.motivo ILIKE ${patron})` : sql``}
    ${f.desde ? sql`AND s.fecha_hasta >= ${f.desde}::date` : sql``}
    ${f.hasta ? sql`AND s.fecha_desde <= ${f.hasta}::date` : sql``}`;
  const [{ total }] = await sql`SELECT count(*)::int AS total FROM solicitud_permiso s JOIN persona p ON p.id = s.persona_id ${donde}`;
  const items = await sql`
    SELECT ${COLUMNAS} FROM solicitud_permiso s JOIN persona p ON p.id = s.persona_id ${donde}
    ORDER BY s.created_at DESC, s.id LIMIT ${TAM_PAGINA} OFFSET ${desplazamiento(f.pagina)}
  `;
  return armarPagina([...items], total, f.pagina);
}

/** Detalle con las "firmas" (historial). Mismo alcance que el listado. */
export async function obtenerSolicitud(ctx: CtxPermiso, id: string) {
  const [s] = await sql`SELECT ${COLUMNAS} FROM solicitud_permiso s JOIN persona p ON p.id = s.persona_id WHERE s.id = ${id}`;
  if (!s) throw new ErrorApp(404, 'Solicitud no encontrada');
  const [u] = await sql`SELECT persona_id FROM usuario WHERE id = ${ctx.usuarioId}`;
  // "Propia": la pidió para sí o la cargó. Es la única que puede anularla.
  const esPropia = s.persona_id === u?.persona_id || s.cargado_por === ctx.usuarioId;
  if (!veTodas(ctx) && !esPropia) throw new ErrorApp(404, 'Solicitud no encontrada');
  const eventos = await sql`
    SELECT e.id, e.estado_anterior, e.estado_nuevo, e.con_descuento, e.comentario, e.created_at, u.username AS autor
    FROM solicitud_permiso_evento e JOIN usuario u ON u.id = e.autor_id WHERE e.solicitud_id = ${id} ORDER BY e.created_at, e.id
  `;
  return { ...s, es_propia: esPropia, eventos: [...eventos] };
}
