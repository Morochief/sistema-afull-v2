export const ESTADOS_TAREA = [
  'PENDIENTE',
  'EN_CURSO',
  'PAUSADA',
  'LISTO',
  'CANCELADA',
] as const;

export type EstadoTarea = (typeof ESTADOS_TAREA)[number];

/**
 * El tipo de tarea es un PROCESO del catálogo `tipo_tarea` (migración 0012), administrable por Juan.
 * En el código solo se valida la forma del código; que exista y esté activo lo controla la base y el servicio.
 */
export const CODIGO_PROCESO = /^[A-Z][A-Z0-9_]{1,39}$/;
export type TipoTarea = string;
export type AreaProceso = 'TALLER' | 'CALLE' | 'DISENO' | 'COMERCIAL' | 'OTRO';
export type Proceso = { codigo: string; nombre: string; area: AreaProceso; orden: number; activo: boolean };

export const MOTIVOS_CIERRE_INTERVALO = [
  'PAUSA',
  'ALMUERZO',
  'FALTA_MATERIAL',
  'LLUVIA',
  'CAMBIO_TAREA',
  'FIN',
  'OTRO',
] as const;

export type MotivoCierreIntervalo = (typeof MOTIVOS_CIERRE_INTERVALO)[number];

const TRANSICIONES_TAREA: Record<EstadoTarea, readonly EstadoTarea[]> = {
  PENDIENTE: ['EN_CURSO', 'CANCELADA'],
  EN_CURSO: ['PAUSADA', 'LISTO'],
  PAUSADA: ['EN_CURSO', 'LISTO', 'CANCELADA'],
  LISTO: [],
  CANCELADA: [],
};

export const transicionesTareaDesde = (de: EstadoTarea): readonly EstadoTarea[] => TRANSICIONES_TAREA[de];
export const puedeTransicionarTarea = (de: EstadoTarea, a: EstadoTarea): boolean => TRANSICIONES_TAREA[de].includes(a);
export const esEstadoTareaFinal = (e: EstadoTarea): boolean => TRANSICIONES_TAREA[e].length === 0;
