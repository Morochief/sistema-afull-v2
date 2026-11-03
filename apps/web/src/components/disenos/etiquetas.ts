import type { DisenoVersion } from '@afull/shared';
import type { BadgeVariant } from '../ui/badge.js';

export const ESTADO_DISENO: Record<DisenoVersion['estado'], { texto: string; variant: BadgeVariant }> = {
  PENDIENTE: { texto: 'Por verificar', variant: 'warning' },
  APROBADO: { texto: 'Aprobado', variant: 'success' },
  OBSERVADO: { texto: 'Observado', variant: 'danger' },
};
