import { z } from 'zod';
import type { Pagina } from '@afull/shared';

export const TAM_PAGINA = 25;
export const paginaSchema = z.coerce.number().int().min(1).max(1_000_000).catch(1);
export const desplazamiento = (pagina: number) => (pagina - 1) * TAM_PAGINA;
export const escaparLike = (s: string) => s.replace(/[\\%_]/g, '\\$&');

export type { Pagina };

export const armarPagina = <T>(items: T[], total: number, pagina: number): Pagina<T> => ({
  items,
  total,
  pagina,
  tamPagina: TAM_PAGINA,
  totalPaginas: Math.max(1, Math.ceil(total / TAM_PAGINA)),
});
