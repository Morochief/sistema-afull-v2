import type { TransactionSql } from 'postgres';
import { calcularMerma, repartirCantidad, esEstadoFinal, type EstadoOT, type Pieza } from '@afull/shared';
import { sql } from '../../db/client.js';
import { auditar } from '../auditoria/service.js';
import { ErrorApp, traducirErrorPg } from '../../lib/errores.js';
import type { Ctx } from '../clientes/service.js';

type Linea = { otId: string; tareaId?: string; insumoId: string; cantidad: number; esDesperdicio: boolean; nota?: string; grupoId?: string; clave: string };

async function enTx<T>(fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
  try {
    return (await sql.begin(fn)) as T;
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    if ((e as { constraint_name?: string }).constraint_name === 'fk_consumo_tarea_ot') throw new ErrorApp(400, 'Esa tarea no es de la OT indicada');
    traducirErrorPg(e);
  }
}

async function personaDe(tx: TransactionSql, usuarioId: string) {
  const [u] = await tx<{ persona_id: string | null }[]>`SELECT persona_id FROM usuario WHERE id = ${usuarioId}`;
  return u?.persona_id ?? null;
}

async function otAbierta(tx: TransactionSql, otId: string) {
  const [ot] = await tx`SELECT estado FROM orden_trabajo WHERE id = ${otId} FOR SHARE`;
  if (!ot) throw new ErrorApp(404, 'OT no encontrada');
  if (esEstadoFinal(ot.estado as EstadoOT)) throw new ErrorApp(409, `La OT está ${ot.estado}: ya no se le carga material`);
}

/** Inserta una línea con el costo VIGENTE congelado. La clave de idempotencia evita duplicar un reintento. */
async function insertar(tx: TransactionSql, ctx: Ctx, persona: string | null, l: Linea) {
  const [i] = await tx`
    SELECT i.activo, (SELECT costo_unitario_gs FROM insumo_precio p WHERE p.insumo_id = i.id ORDER BY vigente_desde DESC, id DESC LIMIT 1) AS costo
    FROM insumo i WHERE i.id = ${l.insumoId}
  `;
  if (!i?.activo) throw new ErrorApp(400, 'Insumo inexistente o desactivado');
  if (i.costo === null) throw new ErrorApp(400, 'El insumo no tiene precio cargado');
  const [c] = await tx`
    INSERT INTO consumo_insumo (orden_trabajo_id, tarea_id, insumo_id, persona_id, cargado_por, cantidad, costo_unitario_gs, es_desperdicio, grupo_id, nota, clave_idempotencia)
    VALUES (${l.otId}, ${l.tareaId ?? null}, ${l.insumoId}, ${persona}, ${ctx.usuarioId}, ${l.cantidad}, ${i.costo}, ${l.esDesperdicio}, ${l.grupoId ?? null}, ${l.nota ?? null}, ${l.clave})
    RETURNING id
  `;
  return c.id as string;
}

/** Si la clave ya se usó, es un reintento: devolver lo ya registrado sin repetir nada. */
async function previo(tx: TransactionSql, clave: string) {
  const [p] = await tx`SELECT id, grupo_id FROM consumo_insumo WHERE clave_idempotencia = ${clave}`;
  return p as { id: string; grupo_id: string | null } | undefined;
}

export function registrarConsumo(ctx: Ctx, d: { otId: string; tareaId?: string; insumoId: string; cantidad: number; esDesperdicio: boolean; nota?: string; claveIdempotencia: string }) {
  return enTx(async (tx) => {
    const p = await previo(tx, d.claveIdempotencia);
    if (p) return { ids: [p.id], repetido: true };
    await otAbierta(tx, d.otId);
    const id = await insertar(tx, ctx, await personaDe(tx, ctx.usuarioId), { ...d, clave: d.claveIdempotencia });
    await auditar({ usuarioId: ctx.usuarioId, accion: 'consumo.registrar', recurso: 'orden_trabajo', recursoId: d.otId, ip: ctx.ip, metadata: { insumoId: d.insumoId, cantidad: d.cantidad } }, tx);
    return { ids: [id], repetido: false };
  });
}

/** Merma (REQ-04): una línea con los m² de piezas y otra con el desperdicio (mismo grupo). Claves derivadas de la del pedido. */
export function registrarMerma(ctx: Ctx, d: { otId: string; tareaId?: string; insumoId: string; insumoDesperdicioId?: string; anchoMaterialM: number; largoUsadoM: number; piezas: Pieza[]; claveIdempotencia: string }) {
  return enTx(async (tx) => {
    let r;
    try {
      r = calcularMerma(d.anchoMaterialM, d.largoUsadoM, d.piezas);
    } catch (e) {
      throw new ErrorApp(400, (e as Error).message);
    }
    const p = await previo(tx, d.claveIdempotencia);
    if (p) return { ...r, repetido: true };
    await otAbierta(tx, d.otId);
    const persona = await personaDe(tx, ctx.usuarioId);
    const grupoId = crypto.randomUUID();
    const nota = `Material ${d.anchoMaterialM} × ${d.largoUsadoM} m · aprovechamiento ${r.aprovechamientoPct} %`;
    await insertar(tx, ctx, persona, { otId: d.otId, tareaId: d.tareaId, insumoId: d.insumoId, cantidad: r.m2Piezas, esDesperdicio: false, nota, grupoId, clave: d.claveIdempotencia });
    if (r.m2Desperdicio > 0) {
      await insertar(tx, ctx, persona, { otId: d.otId, tareaId: d.tareaId, insumoId: d.insumoDesperdicioId ?? d.insumoId, cantidad: r.m2Desperdicio, esDesperdicio: true, nota, grupoId, clave: crypto.randomUUID() });
    }
    await auditar({ usuarioId: ctx.usuarioId, accion: 'consumo.merma', recurso: 'orden_trabajo', recursoId: d.otId, ip: ctx.ip, metadata: { ...r } }, tx);
    return { ...r, repetido: false };
  });
}

/** Plancha/bobina compartida: una línea por OT en proporción a sus m² de piezas; Σ = cantidad total exacta. */
export function registrarCompartido(ctx: Ctx, d: { insumoId: string; cantidadTotal: number; repartos: { otId: string; m2Piezas: number }[]; nota?: string; claveIdempotencia: string }) {
  return enTx(async (tx) => {
    const p = await previo(tx, d.claveIdempotencia);
    if (p) return { repetido: true, partes: [] as number[] };
    if (new Set(d.repartos.map((x) => x.otId)).size !== d.repartos.length) throw new ErrorApp(400, 'Cada OT va una sola vez en el reparto');
    const partes = repartirCantidad(d.cantidadTotal, d.repartos.map((x) => x.m2Piezas));
    const persona = await personaDe(tx, ctx.usuarioId);
    const grupoId = crypto.randomUUID();
    for (let i = 0; i < d.repartos.length; i++) {
      await otAbierta(tx, d.repartos[i].otId);
      await insertar(tx, ctx, persona, {
        otId: d.repartos[i].otId, insumoId: d.insumoId, cantidad: partes[i], esDesperdicio: false, grupoId,
        nota: d.nota ?? `Material compartido entre ${d.repartos.length} OTs`, clave: i === 0 ? d.claveIdempotencia : crypto.randomUUID(),
      });
    }
    await auditar({ usuarioId: ctx.usuarioId, accion: 'consumo.compartido', recurso: 'insumo', recursoId: d.insumoId, ip: ctx.ip, metadata: { partes } }, tx);
    return { repetido: false, partes };
  });
}

/** Corregir = consumo negativo que referencia al original (una sola vez). Lo hace quien lo cargó o Comercial. */
export function anularConsumo(ctx: Ctx & { capacidades: string[] }, id: string, motivo: string, clave: string) {
  return enTx(async (tx) => {
    const p = await previo(tx, clave);
    if (p) return { id: p.id, repetido: true };
    const [c] = await tx`SELECT * FROM consumo_insumo WHERE id = ${id}`;
    if (!c) throw new ErrorApp(404, 'Consumo no encontrado');
    if (Number(c.cantidad) < 0) throw new ErrorApp(400, 'Una corrección no se corrige');
    const puede = c.cargado_por === ctx.usuarioId || ctx.capacidades.includes('comercial') || ctx.capacidades.includes('admin');
    if (!puede) throw new ErrorApp(403, 'Solo quien lo cargó o Comercial puede corregirlo');
    const [ya] = await tx`SELECT 1 FROM consumo_insumo WHERE corrige_id = ${id}`;
    if (ya) throw new ErrorApp(409, 'Ese consumo ya fue corregido');
    await otAbierta(tx, c.orden_trabajo_id);
    const [n] = await tx`
      INSERT INTO consumo_insumo (orden_trabajo_id, tarea_id, insumo_id, persona_id, cargado_por, cantidad, costo_unitario_gs, es_desperdicio, grupo_id, corrige_id, nota, clave_idempotencia)
      VALUES (${c.orden_trabajo_id}, ${c.tarea_id}, ${c.insumo_id}, ${c.persona_id}, ${ctx.usuarioId}, ${-Number(c.cantidad)}, ${c.costo_unitario_gs}, ${c.es_desperdicio}, ${c.grupo_id}, ${id}, ${motivo}, ${clave})
      RETURNING id
    `;
    await auditar({ usuarioId: ctx.usuarioId, accion: 'consumo.anular', recurso: 'orden_trabajo', recursoId: c.orden_trabajo_id, ip: ctx.ip, metadata: { consumoId: id, motivo } }, tx);
    return { id: n.id as string, repetido: false };
  });
}

export async function consumosDeOT(otId: string) {
  const items = await sql`
    SELECT c.id, c.insumo_id, i.nombre AS insumo, i.unidad, c.cantidad::float8 AS cantidad, c.costo_unitario_gs::float8 AS costo_unitario_gs,
           round(c.cantidad * c.costo_unitario_gs)::float8 AS total_gs, c.es_desperdicio, c.corrige_id, c.nota, c.created_at,
           p.nombre AS persona, u.username AS cargado_por, t.descripcion AS tarea,
           EXISTS (SELECT 1 FROM consumo_insumo x WHERE x.corrige_id = c.id) AS corregido
    FROM consumo_insumo c JOIN insumo i ON i.id = c.insumo_id JOIN usuario u ON u.id = c.cargado_por
    LEFT JOIN persona p ON p.id = c.persona_id LEFT JOIN tarea t ON t.id = c.tarea_id
    WHERE c.orden_trabajo_id = ${otId} ORDER BY c.created_at, c.id
  `;
  const [{ total, desperdicio }] = await sql`
    SELECT coalesce(round(sum(cantidad * costo_unitario_gs)), 0)::float8 AS total,
           coalesce(round(sum(cantidad * costo_unitario_gs) FILTER (WHERE es_desperdicio)), 0)::float8 AS desperdicio
    FROM consumo_insumo WHERE orden_trabajo_id = ${otId}
  `;
  return { items: [...items], total_gs: total, desperdicio_gs: desperdicio };
}
