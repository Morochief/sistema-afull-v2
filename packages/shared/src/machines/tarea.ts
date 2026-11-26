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
/** Loop 22: las áreas de trabajo de aFull (+ Administración y Otro), en el orden en que se muestran. El montaje va en Logística. */
export const AREAS_PROCESO = {
  TERMINACIONES: 'Terminaciones',
  CARPINTERIA: 'Carpintería',
  PINTURA: 'Pintura',
  IMPRESIONES: 'Impresiones',
  HERRERIA: 'Herrería',
  LOGISTICA: 'Logística',
  DISENO: 'Diseño',
  ADMINISTRACION: 'Administración',
  OTRO: 'Otro',
} as const;
export type AreaProceso = keyof typeof AREAS_PROCESO;
export const CODIGOS_AREA = Object.keys(AREAS_PROCESO) as [AreaProceso, ...AreaProceso[]];
/** `con_medidas`: la tarea tiene "Medidas (cm)" y puede ir en una tanda (Loop 22; antes, una lista fija). */
export type Proceso = { codigo: string; nombre: string; area: AreaProceso; orden: number; activo: boolean; con_medidas: boolean };

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
