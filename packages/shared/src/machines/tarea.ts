export const ESTADOS_TAREA = [
  'PENDIENTE',
  'EN_CURSO',
  'PAUSADA',
  'LISTO',
  'CANCELADA',
] as const;

export type EstadoTarea = (typeof ESTADOS_TAREA)[number];

export const TIPOS_TAREA = [
  'TALLER_IMPRESION',
  'TALLER_CORTE',
  'TALLER_HERRERIA',
  'TALLER_ARMADO',
  'MONTAJE_CALLE',
  'OTRO',
] as const;

export type TipoTarea = (typeof TIPOS_TAREA)[number];

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
