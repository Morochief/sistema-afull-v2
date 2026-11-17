import { sql } from '../../db/client.js';
import { auditar } from '../auditoria/service.js';
import { ErrorApp } from '../../lib/errores.js';
import type { Ctx } from '../clientes/service.js';

export type EntregaOT = {
  parada_id: string; hoja_ruta_id: string; fecha: string; receptor_nombre: string; receptor_cargo: string | null; entregada_at: string;
  sin_senal: boolean; completada_por: string | null; remision_archivo_id: string | null; remision_por_llegar: boolean;
};

/** Loop 17: las entregas de la OT (paradas hechas con receptor) con la foto de la remisión, si llegó. */
export async function entregasOT(otId: string) {
  const [o] = await sql<{ lleva_remision: boolean }[]>`SELECT lleva_remision FROM orden_trabajo WHERE id = ${otId}`;
  if (!o) throw new ErrorApp(404, 'OT no encontrada');
  const filas = await sql<(EntregaOT & { completada_at: Date })[]>`
    SELECT pa.id AS parada_id, pa.hoja_ruta_id, h.fecha::text AS fecha, pa.receptor_nombre, pa.receptor_cargo, pa.completada_at,
           pa.cierre_sin_senal AS sin_senal, coalesce(pp.nombre, u.username) AS completada_por, ar.id AS remision_archivo_id
    FROM hoja_ruta_parada pa JOIN hoja_ruta h ON h.id = pa.hoja_ruta_id
    LEFT JOIN usuario u ON u.id = pa.completada_por LEFT JOIN persona pp ON pp.id = u.persona_id
    LEFT JOIN archivo ar ON ar.parada_id = pa.id AND ar.tipo = 'REMISION_PARADA' AND ar.estado = 'SUBIDO'
    WHERE pa.orden_trabajo_id = ${otId} AND pa.estado = 'COMPLETADA' AND pa.receptor_nombre IS NOT NULL
    ORDER BY pa.completada_at DESC`;
  return {
    lleva_remision: o.lleva_remision,
    entregas: filas.map(({ completada_at, ...f }) => ({
      ...f, entregada_at: completada_at.toISOString(), remision_por_llegar: o.lleva_remision && !f.remision_archivo_id,
    })),
  };
}

/** "Esta OT no lleva remisión" (o vuelve a llevar). Rige para las próximas entregas. */
export async function fijarRemision(ctx: Ctx, otId: string, lleva: boolean) {
  return sql.begin(async (tx) => {
    const [o] = await tx`UPDATE orden_trabajo SET lleva_remision = ${lleva} WHERE id = ${otId} RETURNING id`;
    if (!o) throw new ErrorApp(404, 'OT no encontrada');
    await auditar({ usuarioId: ctx.usuarioId, accion: 'ot.remision', recurso: 'orden_trabajo', recursoId: otId, ip: ctx.ip, metadata: { lleva } }, tx);
    return { lleva_remision: lleva };
  });
}
