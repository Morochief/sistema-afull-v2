import { sql } from '../../db/client.js';

/**
 * Qué OT sigue un pedido y en qué está su presupuesto (docs/LOOP_9_DISENO.md §6). Se usa como JOIN sobre `pedido pe`:
 * - `pr`: la versión VIGENTE del presupuesto del pedido (la última con el mismo número).
 * - `o`: la OT directa del pedido o, si el presupuesto vigente está aprobado, la que generó: la del mismo local
 *   del pedido; si no, la menos avanzada (las canceladas al final).
 * Columnas que deja: o.codigo_ot, o.estado (estado_ot), pr.numero (presupuesto_numero), pr.estado (presupuesto_estado).
 */
export const SEGUIMIENTO_PEDIDO = sql`
  LEFT JOIN LATERAL (
    SELECT pv.id, pv.numero, pv.estado FROM presupuesto p0 JOIN presupuesto pv ON pv.numero = p0.numero
    WHERE p0.id = pe.presupuesto_id ORDER BY pv.version DESC LIMIT 1
  ) pr ON true
  LEFT JOIN LATERAL (
    SELECT ot.id, ot.codigo_ot, ot.estado FROM orden_trabajo ot
    WHERE ot.id = pe.orden_trabajo_id
       OR (pe.orden_trabajo_id IS NULL AND pr.estado = 'APROBADO' AND ot.presupuesto_id = pr.id)
    ORDER BY (pe.sucursal_id IS NOT NULL AND ot.sucursal_id = pe.sucursal_id) DESC,
             array_position(ARRAY['PENDIENTE', 'EN_DISENO', 'EN_TALLER', 'EN_MONTAJE', 'TERMINADO', 'CANCELADO']::text[], ot.estado::text),
             ot.codigo_ot
    LIMIT 1
  ) o ON true`;
