import { sql } from '../../db/client.js';
import { auditar } from '../auditoria/service.js';
import { ErrorApp, traducirErrorPg } from '../../lib/errores.js';
import type { TarifaFila } from '@afull/shared';
import type { Ctx } from './service.js';

export async function listarTarifas(personaId: string): Promise<TarifaFila[]> {
  try {
    const [p] = await sql<{ id: string }[]>`SELECT id FROM persona WHERE id = ${personaId}`;
    if (!p) throw new ErrorApp(404, 'Persona no encontrada');

    const filas = await sql<TarifaFila[]>`
      SELECT id, persona_id, tarifa_hora_gs, fecha_inicio, fecha_fin, created_at, updated_at
      FROM tarifa_persona
      WHERE persona_id = ${personaId}
      ORDER BY fecha_inicio DESC, created_at DESC
    `;
    return [...filas];
  } catch (e) {
    traducirErrorPg(e);
  }
}

export async function crearTarifa(
  ctx: Ctx,
  personaId: string,
  datos: { tarifaHoraGs: number; fechaInicio: string; fechaFin?: string }
): Promise<TarifaFila> {
  try {
    const [p] = await sql<{ id: string; nombre: string }[]>`SELECT id, nombre FROM persona WHERE id = ${personaId}`;
    if (!p) throw new ErrorApp(404, 'Persona no encontrada');

    const [tarifa] = await sql<TarifaFila[]>`
      INSERT INTO tarifa_persona (persona_id, tarifa_hora_gs, fecha_inicio, fecha_fin)
      VALUES (${personaId}, ${datos.tarifaHoraGs}, ${datos.fechaInicio}, ${datos.fechaFin ?? null})
      RETURNING id, persona_id, tarifa_hora_gs, fecha_inicio, fecha_fin, created_at, updated_at
    `;

    await auditar({
      usuarioId: ctx.usuarioId,
      accion: 'TARIFA_CREAR',
      recurso: 'tarifa_persona',
      recursoId: tarifa.id,
      ip: ctx.ip,
      metadata: { personaId, tarifaHoraGs: datos.tarifaHoraGs, fechaInicio: datos.fechaInicio, fechaFin: datos.fechaFin },
    });

    return tarifa;
  } catch (e) {
    traducirErrorPg(e);
  }
}

export async function cerrarTarifa(
  ctx: Ctx,
  tarifaId: string,
  datos: { fechaFin: string }
): Promise<TarifaFila> {
  try {
    const [tarifa] = await sql<TarifaFila[]>`
      UPDATE tarifa_persona
      SET fecha_fin = ${datos.fechaFin}
      WHERE id = ${tarifaId} AND fecha_fin IS NULL
      RETURNING id, persona_id, tarifa_hora_gs, fecha_inicio, fecha_fin, created_at, updated_at
    `;

    if (!tarifa) {
      const [existente] = await sql<{ id: string; fecha_fin: string | null }[]>`
        SELECT id, fecha_fin FROM tarifa_persona WHERE id = ${tarifaId}
      `;
      if (!existente) throw new ErrorApp(404, 'Tarifa no encontrada');
      if (existente.fecha_fin !== null) {
        throw new ErrorApp(400, 'No se puede modificar una tarifa con vigencia cerrada');
      }
      throw new ErrorApp(400, 'Error al cerrar tarifa');
    }

    await auditar({
      usuarioId: ctx.usuarioId,
      accion: 'TARIFA_CERRAR',
      recurso: 'tarifa_persona',
      recursoId: tarifa.id,
      ip: ctx.ip,
      metadata: { fechaFin: datos.fechaFin },
    });

    return tarifa;
  } catch (e) {
    traducirErrorPg(e);
  }
}
