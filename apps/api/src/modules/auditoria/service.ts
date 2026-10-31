import { sql } from '../../db/client.js';
import type { Sql, TransactionSql } from 'postgres';

export type EventoAuditoriaInput = {
  usuarioId: string;
  accion: string;
  recurso: string;
  recursoId?: string;
  ip?: string;
  metadata?: Record<string, unknown>;
};

const SECRET_KEYS = /pass|token|secret|hash|cookie|authorization|api[_-]?key/i;

export function limpiarMetadata(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(limpiarMetadata);
  const limpio: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    limpio[k] = SECRET_KEYS.test(k) ? '[omitido]' : limpiarMetadata(v);
  }
  return limpio;
}

export async function auditar(ev: EventoAuditoriaInput, tx?: TransactionSql | Sql): Promise<void> {
  const runner = (tx ?? sql) as Sql;
  const raw = JSON.stringify(limpiarMetadata(ev.metadata ?? {}));
  const meta = raw.length > 8192 ? JSON.stringify({ error: 'metadata_excede_8kb' }) : raw;

  await runner`
    INSERT INTO evento_auditoria (usuario_id, accion, recurso, recurso_id, ip, metadata)
    VALUES (${ev.usuarioId}, ${ev.accion}, ${ev.recurso}, ${ev.recursoId ?? null}, ${ev.ip ?? null}, ${meta}::jsonb)
  `;
}
