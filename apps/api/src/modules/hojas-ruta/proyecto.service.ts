import { auditar } from '../auditoria/service.js';
import { ErrorApp } from '../../lib/errores.js';
import type { Ctx } from '../clientes/service.js';
import { enTx, hojaEditable } from './service.js';

type Salteada = { codigo_ot: string; motivo: 'cerrada' | 'ya_esta' };

/**
 * Agrega a la hoja todas las OTs abiertas de un proyecto que no estén ya (docs/LOOP_4_DISENO.md §8), al final y en
 * orden de código. Todo o nada: si no hay ninguna para agregar, no cambia nada y responde 400.
 */
export function agregarProyecto(ctx: Ctx, hojaId: string, d: { proyectoId: string; motivoExtra?: string }) {
  return enTx(async (tx) => {
    const h = await hojaEditable(tx, hojaId);
    const [p] = await tx`SELECT id FROM proyecto WHERE id = ${d.proyectoId}`;
    if (!p) throw new ErrorApp(400, 'Proyecto inexistente');
    const extra = h.estado === 'EN_CURSO';
    if (extra && !d.motivoExtra?.trim()) throw new ErrorApp(400, 'La hoja ya salió: las paradas nuevas son EXTRA y requieren motivo');
    const ots = await tx`
      SELECT o.id, o.codigo_ot, o.estado IN ('TERMINADO', 'CANCELADO') AS cerrada,
             EXISTS (SELECT 1 FROM hoja_ruta_parada pa WHERE pa.hoja_ruta_id = ${hojaId} AND pa.orden_trabajo_id = o.id) AS ya_esta
      FROM orden_trabajo o WHERE o.proyecto_id = ${d.proyectoId} ORDER BY o.codigo_ot`;
    const salteadas: Salteada[] = ots.filter((o) => o.cerrada || o.ya_esta)
      .map((o) => ({ codigo_ot: o.codigo_ot as string, motivo: o.cerrada ? 'cerrada' : 'ya_esta' }));
    const nuevas = ots.filter((o) => !o.cerrada && !o.ya_esta);
    if (!nuevas.length) throw new ErrorApp(400, 'Ese proyecto no tiene OTs abiertas que falten en la hoja');
    const [{ sig }] = await tx`SELECT coalesce(max(orden_secuencia), 0)::int AS sig FROM hoja_ruta_parada WHERE hoja_ruta_id = ${hojaId}`;
    const agregadas: { id: string; codigo_ot: string }[] = [];
    for (const [i, o] of nuevas.entries()) {
      const [r] = await tx`
        INSERT INTO hoja_ruta_parada (hoja_ruta_id, orden_trabajo_id, orden_secuencia, tipo, motivo_extra)
        VALUES (${hojaId}, ${o.id}, ${(sig as number) + i + 1}, ${extra ? 'EXTRA' : 'PLANIFICADA'}, ${extra ? d.motivoExtra!.trim() : null})
        RETURNING id`;
      agregadas.push({ id: r.id as string, codigo_ot: o.codigo_ot as string });
    }
    await auditar({ usuarioId: ctx.usuarioId, accion: 'hoja_ruta.paradas_proyecto', recurso: 'hoja_ruta', recursoId: hojaId, ip: ctx.ip,
      metadata: { proyectoId: d.proyectoId, agregadas: agregadas.length, salteadas: salteadas.length, extra } }, tx);
    return { agregadas, salteadas };
  });
}
