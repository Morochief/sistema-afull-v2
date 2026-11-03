import type { TransactionSql } from 'postgres';
import { sql } from '../../db/client.js';
import { ErrorApp, traducirErrorPg } from '../../lib/errores.js';

/** Persona vinculada al usuario de la sesión, bloqueada `FOR UPDATE` (serializa sus acciones de campo). */
export async function personaDeSesion(tx: TransactionSql, usuarioId: string) {
  const [u] = await tx<{ persona_id: string | null }[]>`SELECT persona_id FROM usuario WHERE id = ${usuarioId}`;
  if (!u?.persona_id) throw new ErrorApp(403, 'Tu usuario no está vinculado a una persona');
  const [p] = await tx<{ id: string; activo: boolean; nombre: string }[]>`
    SELECT id, activo, nombre FROM persona WHERE id = ${u.persona_id} FOR UPDATE
  `;
  if (!p?.activo) throw new ErrorApp(403, 'Persona vinculada inexistente o inactiva');
  return p;
}

export async function enTx<T>(fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
  try {
    return (await sql.begin(fn)) as T;
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    const pg = e as { code?: string; constraint_name?: string };
    if (pg.code === '23505' && pg.constraint_name === 'uq_viaje_abierto_vehiculo') {
      throw new ErrorApp(409, 'El vehículo ya tiene un viaje abierto: hay que cerrarlo primero');
    }
    if (pg.code === '23505' && pg.constraint_name === 'uq_viaje_abierto_conductor') {
      throw new ErrorApp(409, 'Ya tenés un viaje abierto: cerralo antes de iniciar otro');
    }
    traducirErrorPg(e);
  }
}

/** Fecha de hoy en Asunción (AAAA-MM-DD): el día laboral no es el día UTC. */
export const hoyAsuncion = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
