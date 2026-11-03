import type { EstadoPermiso } from '@afull/shared';
import type { BadgeVariant } from '../ui/badge.js';
import type { SolicitudPermiso } from '../../lib/api-permisos.js';

export const ESTADO_PERMISO: Record<EstadoPermiso, { texto: string; variant: BadgeVariant }> = {
  PENDIENTE: { texto: 'Pendiente', variant: 'warning' },
  AUTORIZADA: { texto: 'Autorizada', variant: 'default' },
  REGISTRADA: { texto: 'Registrada', variant: 'success' },
  RECHAZADA: { texto: 'Rechazada', variant: 'danger' },
  ANULADA: { texto: 'Anulada', variant: 'neutral' },
};

const dia = (f: string) => f.split('-').reverse().join('/');
/** "05/11/2026 de 15:00 a 17:00" o "05/11/2026 al 07/11/2026". */
export function periodo(s: Pick<SolicitudPermiso, 'modalidad' | 'fecha_desde' | 'fecha_hasta' | 'hora_desde' | 'hora_hasta'>) {
  if (s.modalidad === 'HORAS') return `${dia(s.fecha_desde)} de ${s.hora_desde} a ${s.hora_hasta}`;
  return s.fecha_desde === s.fecha_hasta ? dia(s.fecha_desde) : `${dia(s.fecha_desde)} al ${dia(s.fecha_hasta)}`;
}
