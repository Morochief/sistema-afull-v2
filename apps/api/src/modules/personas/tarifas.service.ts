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
    return await sql.begin(async (tx) => {
      const [p] = await tx<{ id: string }[]>`SELECT id FROM persona WHERE id = ${personaId}`;
      if (!p) throw new ErrorApp(404, 'Persona no encontrada');

      const [tarifa] = await tx<TarifaFila[]>`
        INSERT INTO tarifa_persona (persona_id, tarifa_hora_gs, fecha_inicio, fecha_fin)
        VALUES (${personaId}, ${datos.tarifaHoraGs}, ${datos.fechaInicio}, ${datos.fechaFin ?? null})
        RETURNING id, persona_id, tarifa_hora_gs, fecha_inicio, fecha_fin, created_at, updated_at
      `;
      // Auditoría dentro de la misma transacción (CA-0.5)
      await auditar(
        {
          usuarioId: ctx.usuarioId,
          accion: 'tarifa.crear',
          recurso: 'tarifa_persona',
          recursoId: tarifa.id,
          ip: ctx.ip,
          metadata: { personaId, tarifaHoraGs: datos.tarifaHoraGs, fechaInicio: datos.fechaInicio, fechaFin: datos.fechaFin },
        },
        tx,
      );
      return tarifa;
    });
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}

export async function cerrarTarifa(
  ctx: Ctx,
  tarifaId: string,
  datos: { fechaFin: string }
): Promise<TarifaFila> {
  try {
    return await sql.begin(async (tx) => {
      const [existente] = await tx<{ id: string; fecha_fin: string | null }[]>`
        SELECT id, fecha_fin FROM tarifa_persona WHERE id = ${tarifaId} FOR UPDATE
      `;
      if (!existente) throw new ErrorApp(404, 'Tarifa no encontrada');
      if (existente.fecha_fin !== null) {
        throw new ErrorApp(400, 'No se puede modificar una tarifa con vigencia cerrada');
      }

      const [tarifa] = await tx<TarifaFila[]>`
        UPDATE tarifa_persona SET fecha_fin = ${datos.fechaFin}
        WHERE id = ${tarifaId}
        RETURNING id, persona_id, tarifa_hora_gs, fecha_inicio, fecha_fin, created_at, updated_at
      `;
      await auditar(
        {
          usuarioId: ctx.usuarioId,
          accion: 'tarifa.cerrar',
          recurso: 'tarifa_persona',
          recursoId: tarifa.id,
          ip: ctx.ip,
          metadata: { fechaFin: datos.fechaFin },
        },
        tx,
      );
      return tarifa;
    });
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}
