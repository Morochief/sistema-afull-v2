import { z } from 'zod';

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha AAAA-MM-DD');

/** Filtro del listado de rentabilidad (OTs cerradas con su costeo congelado). */
export const filtroCosteoSchema = z.object({
  q: z.string().trim().max(100).optional(),
  estado: z.enum(['TERMINADO', 'CANCELADO']).optional(),
  desde: fecha.optional(),
  hasta: fecha.optional(),
  pagina: z.coerce.number().int().min(1).max(1_000_000).default(1),
});
export type FiltroCosteo = z.infer<typeof filtroCosteoSchema>;
