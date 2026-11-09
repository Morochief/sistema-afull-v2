import type { TransactionSql } from 'postgres';
import type { FiltroArchivos, SolicitarArchivo } from '@afull/shared';
import { ErrorApp } from '../../lib/errores.js';

/** Quién pide: un usuario con sesión, o un cliente por su enlace del portal. */
export type Actor =
  | { tipo: 'usuario'; usuarioId: string; capacidades: string[]; ip?: string }
  | { tipo: 'portal'; accesoId: string; clienteId: string };

export type Columna = 'viaje_id' | 'parada_id' | 'tarea_id' | 'solicitud_permiso_id' | 'pedido_id';
export type Ref = { columna: Columna; id: string };

const tiene = (a: Actor, ...caps: string[]) =>
  a.tipo === 'usuario' && (a.capacidades.includes('admin') || caps.some((c) => a.capacidades.includes(c)));

async function personaDe(tx: TransactionSql, a: Actor): Promise<string | null> {
  if (a.tipo !== 'usuario') return null;
  const [u] = await tx`SELECT persona_id FROM usuario WHERE id = ${a.usuarioId}`;
  return (u?.persona_id as string | null) ?? null;
}
const soloUsuario = (a: Actor) => {
  if (a.tipo !== 'usuario') throw new ErrorApp(403, 'Permiso denegado');
};

/** Odómetro: por id o por la clave con que se inició (sin señal el celular no conoce el id). */
async function viaje(tx: TransactionSql, d: { viajeId?: string; claveViaje?: string }) {
  if (!d.viajeId && !d.claveViaje) throw new ErrorApp(400, 'Falta indicar el viaje');
  const [v] = d.viajeId
    ? await tx`SELECT id, conductor_persona_id FROM viaje WHERE id = ${d.viajeId}`
    : await tx`SELECT id, conductor_persona_id FROM viaje WHERE clave_idempotencia = ${d.claveViaje!}`;
  // 404 a propósito: si el inicio del viaje se guardó sin señal y todavía no llegó, la foto espera y se reintenta.
  if (!v) throw new ErrorApp(404, 'El viaje todavía no llegó al servidor');
  return v as { id: string; conductor_persona_id: string };
}

async function paradaConCuadrilla(tx: TransactionSql, paradaId: string, persona: string | null) {
  const [p] = await tx`
    SELECT pa.id, bool_or(q.activo) AS en_cuadrilla
    FROM hoja_ruta_parada pa LEFT JOIN hoja_ruta_persona q ON q.hoja_ruta_id = pa.hoja_ruta_id AND q.persona_id = ${persona}
    WHERE pa.id = ${paradaId} GROUP BY pa.id
  `;
  return p as { id: string; en_cuadrilla: boolean | null } | undefined;
}

async function tarea(tx: TransactionSql, tareaId: string) {
  const [t] = await tx`SELECT id, persona_asignada_id, estado FROM tarea WHERE id = ${tareaId}`;
  return t as { id: string; persona_asignada_id: string | null; estado: string } | undefined;
}

async function solicitud(tx: TransactionSql, a: Actor, solicitudId: string) {
  const [s] = await tx`SELECT id, persona_id, cargado_por, estado FROM solicitud_permiso WHERE id = ${solicitudId}`;
  if (!s) return null;
  const persona = await personaDe(tx, a);
  const propia = a.tipo === 'usuario' && (s.persona_id === persona || s.cargado_por === a.usuarioId);
  return { id: s.id as string, estado: s.estado as string, visible: propia || tiene(a, 'rrhh') };
}

/** Para SUBIR: resuelve la referencia y valida que quien pide pueda subir ahí. */
export async function refParaSubir(tx: TransactionSql, a: Actor, d: SolicitarArchivo): Promise<Ref> {
  switch (d.tipo) {
    case 'ODOMETRO_INICIO':
    case 'ODOMETRO_FIN': {
      soloUsuario(a);
      const v = await viaje(tx, d);
      if (v.conductor_persona_id !== (await personaDe(tx, a))) throw new ErrorApp(403, 'Solo el conductor sube la foto del odómetro');
      return { columna: 'viaje_id', id: v.id };
    }
    case 'EVIDENCIA_PARADA': {
      soloUsuario(a);
      if (!d.paradaId) throw new ErrorApp(400, 'Falta indicar la parada');
      const p = await paradaConCuadrilla(tx, d.paradaId, await personaDe(tx, a));
      if (!p) throw new ErrorApp(404, 'Parada no encontrada');
      if (!p.en_cuadrilla) throw new ErrorApp(403, 'No estás en la cuadrilla de esta hoja de ruta');
      return { columna: 'parada_id', id: p.id };
    }
    case 'MUESTRA_TAREA': {
      soloUsuario(a);
      if (!d.tareaId) throw new ErrorApp(400, 'Falta indicar la tarea');
      const t = await tarea(tx, d.tareaId);
      if (!t) throw new ErrorApp(404, 'Tarea no encontrada');
      const asignada = t.persona_asignada_id !== null && t.persona_asignada_id === (await personaDe(tx, a));
      if (!asignada && !tiene(a, 'taller', 'comercial')) throw new ErrorApp(403, 'Solo quien hace la tarea, taller o comercial suben la muestra');
      if (t.estado === 'CANCELADA') throw new ErrorApp(409, 'La tarea está cancelada');
      return { columna: 'tarea_id', id: t.id };
    }
    case 'COMPROBANTE_PERMISO': {
      soloUsuario(a);
      if (!d.solicitudId) throw new ErrorApp(400, 'Falta indicar la solicitud');
      const s = await solicitud(tx, a, d.solicitudId);
      if (!s?.visible) throw new ErrorApp(404, 'Solicitud no encontrada');
      if (s.estado === 'ANULADA') throw new ErrorApp(409, 'La solicitud está anulada');
      return { columna: 'solicitud_permiso_id', id: s.id };
    }
    case 'FOTO_PEDIDO': {
      if (a.tipo !== 'portal') throw new ErrorApp(403, 'La foto del pedido la sube el cliente desde su enlace');
      if (!d.pedidoId) throw new ErrorApp(400, 'Falta indicar el pedido');
      const [p] = await tx`SELECT id, estado FROM pedido WHERE id = ${d.pedidoId} AND cliente_id = ${a.clienteId}`;
      if (!p) throw new ErrorApp(404, 'Pedido no encontrado');
      if (p.estado !== 'NUEVO') throw new ErrorApp(409, 'El pedido ya fue atendido: no se le agregan fotos');
      return { columna: 'pedido_id', id: p.id as string };
    }
  }
}

/** Para VER: mismo alcance que la pantalla de donde cuelga. Lo que no se puede ver responde 404 (no se confirma que exista). */
export async function refParaVer(tx: TransactionSql, a: Actor, f: FiltroArchivos): Promise<Ref> {
  const noEsta = () => new ErrorApp(404, 'No encontrado');
  if (f.viajeId) {
    const [v] = await tx`SELECT id, conductor_persona_id FROM viaje WHERE id = ${f.viajeId}`;
    if (!v || !(tiene(a, 'comercial') || v.conductor_persona_id === (await personaDe(tx, a)))) throw noEsta();
    return { columna: 'viaje_id', id: v.id as string };
  }
  if (f.paradaId) {
    const p = await paradaConCuadrilla(tx, f.paradaId, await personaDe(tx, a));
    if (!p || !(tiene(a, 'comercial') || p.en_cuadrilla)) throw noEsta();
    return { columna: 'parada_id', id: p.id };
  }
  if (f.tareaId) {
    const t = await tarea(tx, f.tareaId);
    const asignada = t?.persona_asignada_id != null && t.persona_asignada_id === (await personaDe(tx, a));
    if (!t || !(tiene(a, 'comercial', 'taller') || asignada)) throw noEsta();
    return { columna: 'tarea_id', id: t.id };
  }
  if (f.solicitudId) {
    const s = await solicitud(tx, a, f.solicitudId);
    if (!s?.visible) throw noEsta();
    return { columna: 'solicitud_permiso_id', id: s.id };
  }
  const [p] = await tx`SELECT id, cliente_id FROM pedido WHERE id = ${f.pedidoId!}`;
  const visible = a.tipo === 'portal' ? p?.cliente_id === a.clienteId : tiene(a, 'comercial');
  if (!p || !visible) throw noEsta();
  return { columna: 'pedido_id', id: p.id as string };
}
