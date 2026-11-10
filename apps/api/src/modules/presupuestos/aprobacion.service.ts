import type { TransactionSql } from 'postgres';
import { repartirMontoPorSucursal, type EstadoPresupuesto } from '@afull/shared';
import { auditar } from '../auditoria/service.js';
import { ErrorApp } from '../../lib/errores.js';
import type { Ctx } from '../clientes/service.js';
import { bloquear, registrar, exigirComentario, conTransaccion } from './transiciones.service.js';

const anioAsuncion = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion', year: 'numeric' }).format(new Date());

async function codigo(tx: TransactionSql, prefijo: 'OT' | 'PRY') {
  const anio = anioAsuncion();
  const [{ v }] = await tx`SELECT siguiente_valor(${prefijo + '-' + anio}) AS v`;
  return `${prefijo}-${anio}-${String(v).padStart(4, '0')}`;
}

type OTGenerada = { id: string; codigo_ot: string; sucursal_id: string | null; monto_presupuestado_gs: number };

/**
 * Aprobar = todo o nada (decisión del usuario). En UNA transacción:
 * - 0 o 1 sucursal → 1 OT sin proyecto.
 * - 2 o más → 1 proyecto + 1 OT por sucursal, con su monto; Σ montos = total_gs exacto.
 * El `FOR UPDATE` + `desde` hace imposible aprobar dos veces (el segundo recibe 409).
 */
export function aprobarPresupuesto(ctx: Ctx, id: string, desde: EstadoPresupuesto, comentario?: string) {
  return conTransaccion(async (tx) => {
    const evidencia = exigirComentario(comentario, 'Aprobar (evidencia: OC, mail o WhatsApp)');
    const p = await bloquear(tx, id, desde, 'APROBADO');
    const [cab] = await tx<{ titulo: string; total: string }[]>`
      SELECT titulo, total_gs::text AS total FROM presupuesto WHERE id = ${id}
    `;
    const items = await tx<{ cantidad: string; precio_unitario_gs: string; sucursal_id: string | null; sucursal_nombre: string | null }[]>`
      SELECT i.cantidad::text AS cantidad, i.precio_unitario_gs::text AS precio_unitario_gs, i.sucursal_id, s.nombre AS sucursal_nombre
      FROM presupuesto_item i LEFT JOIN sucursal s ON s.id = i.sucursal_id
      WHERE i.presupuesto_id = ${id} AND i.activo
    `;
    const total = Number(cab.total);
    const reparto = repartirMontoPorSucursal(items, p.margen, total);
    if (reparto.length === 0) throw new ErrorApp(400, 'El presupuesto no tiene ítems activos');
    const nombreSucursal = new Map(items.map((i) => [i.sucursal_id, i.sucursal_nombre]));

    let proyecto: { id: string; codigo: string } | null = null;
    if (reparto.length > 1) {
      const cod = await codigo(tx, 'PRY');
      [proyecto] = await tx<{ id: string; codigo: string }[]>`
        INSERT INTO proyecto (codigo, cliente_id, nombre, creado_por)
        VALUES (${cod}, ${p.cliente_id}, ${cab.titulo}, ${ctx.usuarioId})
        RETURNING id, codigo
      `;
      await auditar(
        { usuarioId: ctx.usuarioId, accion: 'proyecto.crear', recurso: 'proyecto', recursoId: proyecto.id, ip: ctx.ip, metadata: { codigo: cod, presupuestoId: id } },
        tx
      );
    }

    const ots: OTGenerada[] = [];
    for (const r of reparto) {
      const cod = await codigo(tx, 'OT');
      const titulo = proyecto ? `${cab.titulo} · ${nombreSucursal.get(r.sucursalId) ?? 'Sin sucursal'}` : cab.titulo;
      const [ot] = await tx<OTGenerada[]>`
        INSERT INTO orden_trabajo
          (codigo_ot, cliente_id, sucursal_id, titulo, creado_por, presupuesto_id, proyecto_id, monto_presupuestado_gs, hoja_estado)
        VALUES (${cod}, ${p.cliente_id}, ${r.sucursalId}, ${titulo.slice(0, 255)}, ${ctx.usuarioId}, ${id},
                ${proyecto?.id ?? null}, ${r.montoOtGs}, ${'BORRADOR'})
        RETURNING id, codigo_ot, sucursal_id, monto_presupuestado_gs::float8 AS monto_presupuestado_gs
      `;
      await tx`
        INSERT INTO ot_evento (orden_trabajo_id, estado_anterior, estado_nuevo, autor_id, comentario)
        VALUES (${ot.id}, NULL, 'PENDIENTE', ${ctx.usuarioId}, ${`Generada al aprobar ${p.numero} v${p.version}`})
      `;
      await auditar(
        { usuarioId: ctx.usuarioId, accion: 'ot.crear', recurso: 'orden_trabajo', recursoId: ot.id, ip: ctx.ip, metadata: { codigo: cod, presupuestoId: id } },
        tx
      );
      ots.push(ot);
    }

    await tx`UPDATE presupuesto SET estado = 'APROBADO' WHERE id = ${id}`;
    await registrar(tx, ctx, p, 'APROBADO', evidencia);
    return { id, estado: 'APROBADO' as const, proyecto, ots };
  });
}
