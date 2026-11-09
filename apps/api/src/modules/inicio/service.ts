import { sql } from '../../db/client.js';
import { puedeVerCostos } from '@afull/shared';

const ZONA = 'America/Asuncion';

/**
 * Tablero de inicio (docs/LOOP_10_INICIO_DISENO.md §2): lo que hay que mirar hoy. Una sola ida a la API; cada consulta lleva
 * al menos un parámetro (regla del pooler 6543). Los montos solo van a quien puede ver costos.
 */
export async function tableroInicio(capacidades: string[]) {
  const [porEstado, trabajando, atrasadas, atrasadasTotal, pedidos, pedidosTotal, disenos, presupuestos, hojas, permisos] = await Promise.all([
    // Abiertas por estado + terminadas del mes según el costeo congelado (el evento de cierre, que no cambia).
    sql`SELECT estado, count(*)::int AS n FROM orden_trabajo WHERE estado NOT IN (${'TERMINADO'}, 'CANCELADO') GROUP BY estado
        UNION ALL
        SELECT 'TERMINADO', count(*)::int FROM ot_costeo
        WHERE estado_final = 'TERMINADO' AND created_at >= date_trunc('month', now() AT TIME ZONE ${ZONA}) AT TIME ZONE ${ZONA}`,
    sql`SELECT p.nombre AS persona, t.tipo, t.descripcion, o.id AS ot_id, o.codigo_ot, c.nombre AS cliente, i.hora_inicio
        FROM tarea_intervalo i JOIN persona p ON p.id = i.persona_id JOIN tarea t ON t.id = i.tarea_id
        JOIN orden_trabajo o ON o.id = t.orden_trabajo_id JOIN cliente c ON c.id = o.cliente_id
        WHERE i.hora_fin IS NULL AND p.activo = ${true} ORDER BY i.hora_inicio`,
    sql`SELECT o.id, o.codigo_ot, o.titulo, o.estado, o.fecha_prometida::text AS fecha_prometida, c.nombre AS cliente
        FROM orden_trabajo o JOIN cliente c ON c.id = o.cliente_id
        WHERE o.estado NOT IN ('TERMINADO', 'CANCELADO') AND o.fecha_prometida < (now() AT TIME ZONE ${ZONA})::date
        ORDER BY o.fecha_prometida, o.codigo_ot LIMIT 10`,
    sql`SELECT count(*)::int AS n FROM orden_trabajo
        WHERE estado NOT IN ('TERMINADO', 'CANCELADO') AND fecha_prometida < (now() AT TIME ZONE ${ZONA})::date`,
    sql`SELECT p.id, p.numero, p.descripcion, p.created_at, c.nombre AS cliente
        FROM pedido p JOIN cliente c ON c.id = p.cliente_id WHERE p.estado = ${'NUEVO'} ORDER BY p.created_at DESC LIMIT 5`,
    sql`SELECT count(*)::int AS n FROM pedido WHERE estado = ${'NUEVO'}`,
    sql`SELECT count(*)::int AS n FROM diseno_version WHERE estado = ${'PENDIENTE'}`,
    sql`SELECT count(*)::int AS n, coalesce(sum(total_gs), 0)::float8 AS monto
        FROM presupuesto WHERE estado = ${'ENVIADO'}`,
    sql`SELECT h.id, h.descripcion, h.estado, v.chapa,
               (SELECT count(*)::int FROM hoja_ruta_parada pa WHERE pa.hoja_ruta_id = h.id) AS paradas,
               (SELECT count(*)::int FROM hoja_ruta_parada pa WHERE pa.hoja_ruta_id = h.id AND pa.estado IN ('COMPLETADA', 'OMITIDA')) AS resueltas,
               (SELECT string_agg(pe.nombre, ', ' ORDER BY pe.nombre) FROM hoja_ruta_persona hp JOIN persona pe ON pe.id = hp.persona_id
                 WHERE hp.hoja_ruta_id = h.id AND hp.activo) AS cuadrilla
        FROM hoja_ruta h LEFT JOIN vehiculo v ON v.id = h.vehiculo_id
        WHERE h.fecha = (now() AT TIME ZONE ${ZONA})::date ORDER BY h.created_at`,
    sql`SELECT count(*)::int AS n FROM solicitud_permiso WHERE estado = ${'PENDIENTE'}`,
  ]);

  let mes: { vendido_gs: number; costo_gs: number; ots: number } | null = null;
  if (puedeVerCostos(capacidades)) {
    const [m] = await sql`
      SELECT count(*)::int AS ots, coalesce(sum(monto_presupuestado_gs), 0)::float8 AS vendido,
             coalesce(sum(total_gs), 0)::float8 AS costo
      FROM ot_costeo
      WHERE estado_final = ${'TERMINADO'} AND monto_presupuestado_gs > 0
        AND created_at >= date_trunc('month', now() AT TIME ZONE ${ZONA}) AT TIME ZONE ${ZONA}`;
    mes = { vendido_gs: m.vendido, costo_gs: m.costo, ots: m.ots };
  }

  return {
    ots_por_estado: Object.fromEntries(porEstado.filter((f) => f.n > 0).map((f) => [f.estado as string, f.n as number])),
    trabajando_ahora: [...trabajando],
    atrasadas_total: atrasadasTotal[0].n as number,
    atrasadas: [...atrasadas],
    pedidos_nuevos_total: pedidosTotal[0].n as number,
    pedidos_nuevos: [...pedidos],
    disenos_por_verificar: disenos[0].n as number,
    presupuestos_enviados: { n: presupuestos[0].n as number, monto_gs: presupuestos[0].monto as number },
    hojas_hoy: [...hojas],
    permisos_pendientes: permisos[0].n as number,
    mes,
  };
}
