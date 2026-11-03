import { sql } from '../../db/client.js';
import type { TransactionSql } from 'postgres';
import type {
  NuevoPresupuestoInput,
  PatchPresupuestoInput,
  ItemPresupuestoInput,
  PatchItemPresupuestoInput,
} from '@afull/shared';
import { auditar } from '../auditoria/service.js';
import { ErrorApp, traducirErrorPg } from '../../lib/errores.js';
import { type Ctx, esperarAvanceReloj, verificarUpdatedAt } from '../clientes/service.js';

const anioAsuncion = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion', year: 'numeric' }).format(new Date());

/** Bloquea la cabecera y exige BORRADOR: los ítems y la cabecera solo se editan en borrador. */
export async function cabeceraEnBorrador(tx: TransactionSql, id: string) {
  const [p] = await tx<{ id: string; cliente_id: string; estado: string; updated_at: Date }[]>`
    SELECT id, cliente_id, estado, updated_at FROM presupuesto WHERE id = ${id} FOR UPDATE
  `;
  if (!p) throw new ErrorApp(404, 'Presupuesto no encontrado');
  if (p.estado !== 'BORRADOR') {
    throw new ErrorApp(409, `El presupuesto está ${p.estado}: para cambiarlo, creá una nueva versión`);
  }
  return p;
}

async function validarSucursal(tx: TransactionSql, sucursalId: string, clienteId: string) {
  const [s] = await tx`SELECT activo FROM sucursal WHERE id = ${sucursalId} AND cliente_id = ${clienteId}`;
  if (!s?.activo) throw new ErrorApp(400, 'Sucursal inexistente, inactiva o de otro cliente');
}

export async function crearPresupuesto(ctx: Ctx, d: NuevoPresupuestoInput) {
  try {
    return await sql.begin(async (tx) => {
      const [c] = await tx`SELECT activo FROM cliente WHERE id = ${d.clienteId}`;
      if (!c?.activo) throw new ErrorApp(400, 'Cliente inexistente o inactivo');
      const anio = anioAsuncion();
      const [{ v }] = await tx`SELECT siguiente_valor(${'PRE-' + anio}) AS v`;
      const numero = `PRE-${anio}-${String(v).padStart(4, '0')}`;
      const [p] = await tx`
        INSERT INTO presupuesto (numero, cliente_id, titulo, notas, margen_pct, validez_dias, creado_por)
        VALUES (${numero}, ${d.clienteId}, ${d.titulo}, ${d.notas ?? null}, ${d.margenPct}, ${d.validezDias}, ${ctx.usuarioId})
        RETURNING id, numero, version, estado, updated_at
      `;
      await tx`
        INSERT INTO presupuesto_evento (presupuesto_id, estado_anterior, estado_nuevo, autor_id)
        VALUES (${p.id}, NULL, 'BORRADOR', ${ctx.usuarioId})
      `;
      await auditar(
        { usuarioId: ctx.usuarioId, accion: 'presupuesto.crear', recurso: 'presupuesto', recursoId: p.id, ip: ctx.ip, metadata: { numero } },
        tx
      );
      return p;
    });
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}

export async function editarPresupuesto(ctx: Ctx, id: string, d: PatchPresupuestoInput) {
  await esperarAvanceReloj(d.updatedAt);
  try {
    return await sql.begin(async (tx) => {
      const actual = await cabeceraEnBorrador(tx, id);
      verificarUpdatedAt(actual.updated_at, d.updatedAt);
      const [a] = await tx`SELECT titulo, notas, margen_pct, validez_dias, precio_final_gs FROM presupuesto WHERE id = ${id}`;
      const [p] = await tx`
        UPDATE presupuesto SET
          titulo = ${d.titulo ?? a.titulo},
          notas = ${d.notas === undefined ? a.notas : d.notas},
          margen_pct = ${d.margenPct ?? a.margen_pct},
          validez_dias = ${d.validezDias ?? a.validez_dias},
          precio_final_gs = ${d.precioFinalGs === undefined ? a.precio_final_gs : d.precioFinalGs}
        WHERE id = ${id}
        RETURNING id, numero, version, estado, updated_at
      `;
      await auditar(
        { usuarioId: ctx.usuarioId, accion: 'presupuesto.editar', recurso: 'presupuesto', recursoId: id, ip: ctx.ip, metadata: { campos: Object.keys(d).filter((k) => k !== 'updatedAt') } },
        tx
      );
      return p;
    });
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}

export async function agregarItem(ctx: Ctx, presupuestoId: string, d: ItemPresupuestoInput) {
  try {
    return await sql.begin(async (tx) => {
      const p = await cabeceraEnBorrador(tx, presupuestoId);
      if (d.sucursalId) await validarSucursal(tx, d.sucursalId, p.cliente_id);
      const [{ sig }] = await tx`
        SELECT coalesce(max(orden), 0) + 1 AS sig FROM presupuesto_item WHERE presupuesto_id = ${presupuestoId}
      `;
      const [item] = await tx`
        INSERT INTO presupuesto_item
          (presupuesto_id, cliente_id, sucursal_id, orden, concepto, descripcion, cantidad, unidad, precio_unitario_gs)
        VALUES (${presupuestoId}, ${p.cliente_id}, ${d.sucursalId ?? null}, ${d.orden ?? sig}, ${d.concepto},
                ${d.descripcion}, ${d.cantidad}, ${d.unidad}, ${d.precioUnitarioGs})
        RETURNING id
      `;
      await auditar(
        { usuarioId: ctx.usuarioId, accion: 'presupuesto.item_agregar', recurso: 'presupuesto', recursoId: presupuestoId, ip: ctx.ip, metadata: { itemId: item.id } },
        tx
      );
      return item;
    });
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}

export async function editarItem(ctx: Ctx, presupuestoId: string, itemId: string, d: PatchItemPresupuestoInput) {
  try {
    return await sql.begin(async (tx) => {
      const p = await cabeceraEnBorrador(tx, presupuestoId);
      const [a] = await tx`SELECT * FROM presupuesto_item WHERE id = ${itemId} AND presupuesto_id = ${presupuestoId}`;
      if (!a) throw new ErrorApp(404, 'Ítem no encontrado en este presupuesto');
      if (d.sucursalId) await validarSucursal(tx, d.sucursalId, p.cliente_id);
      const [item] = await tx`
        UPDATE presupuesto_item SET
          sucursal_id = ${d.sucursalId === undefined ? a.sucursal_id : d.sucursalId},
          concepto = ${d.concepto ?? a.concepto},
          descripcion = ${d.descripcion ?? a.descripcion},
          cantidad = ${d.cantidad ?? a.cantidad},
          unidad = ${d.unidad ?? a.unidad},
          precio_unitario_gs = ${d.precioUnitarioGs ?? a.precio_unitario_gs},
          activo = ${d.activo ?? a.activo},
          orden = ${d.orden ?? a.orden}
        WHERE id = ${itemId}
        RETURNING id, activo
      `;
      await auditar(
        { usuarioId: ctx.usuarioId, accion: 'presupuesto.item_editar', recurso: 'presupuesto', recursoId: presupuestoId, ip: ctx.ip, metadata: { itemId, campos: Object.keys(d) } },
        tx
      );
      return item;
    });
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}
