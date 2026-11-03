import type { EstadoPresupuesto, EstadoProyecto, ConceptoItemPresupuesto } from '@afull/shared';
import type { BadgeVariant } from '../ui/badge.js';

export const ESTADO_PRESUPUESTO: Record<EstadoPresupuesto, { texto: string; variant: BadgeVariant }> = {
  BORRADOR: { texto: 'Borrador', variant: 'neutral' },
  ENVIADO: { texto: 'Enviado', variant: 'warning' },
  APROBADO: { texto: 'Aprobado', variant: 'success' },
  RECHAZADO: { texto: 'Rechazado', variant: 'danger' },
  REEMPLAZADO: { texto: 'Reemplazado', variant: 'neutral' },
  ANULADO: { texto: 'Anulado', variant: 'danger' },
};

export const ESTADO_PROYECTO: Record<EstadoProyecto, { texto: string; variant: BadgeVariant }> = {
  ABIERTO: { texto: 'Abierto', variant: 'warning' },
  CERRADO: { texto: 'Cerrado', variant: 'success' },
  CANCELADO: { texto: 'Cancelado', variant: 'danger' },
};

export const CONCEPTO: Record<ConceptoItemPresupuesto, string> = {
  MATERIAL: 'Material',
  MANO_DE_OBRA: 'Mano de obra',
  TERCERIZADO: 'Tercerizado',
  MOVILIDAD: 'Movilidad',
  OTRO: 'Otro',
};

/** IVA 10 % incluido en el precio (decisión pendiente de confirmar: ver LOOP_3_DISENO §0.4). */
export const ivaIncluido = (total: number) => Math.round(total / 11);
