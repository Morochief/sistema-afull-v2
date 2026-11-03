export const ESTADOS_PRESUPUESTO = [
  'BORRADOR',
  'ENVIADO',
  'APROBADO',
  'RECHAZADO',
  'REEMPLAZADO',
  'ANULADO',
] as const;

export type EstadoPresupuesto = (typeof ESTADOS_PRESUPUESTO)[number];

export const CONCEPTOS_ITEM_PRESUPUESTO = [
  'MATERIAL',
  'MANO_DE_OBRA',
  'TERCERIZADO',
  'MOVILIDAD',
  'OTRO',
] as const;

export type ConceptoItemPresupuesto = (typeof CONCEPTOS_ITEM_PRESUPUESTO)[number];

export const ESTADOS_PROYECTO = ['ABIERTO', 'CERRADO', 'CANCELADO'] as const;
export type EstadoProyecto = (typeof ESTADOS_PROYECTO)[number];

const TRANSICIONES_PRESUPUESTO: Record<EstadoPresupuesto, readonly EstadoPresupuesto[]> = {
  BORRADOR: ['ENVIADO', 'ANULADO'],
  ENVIADO: ['APROBADO', 'RECHAZADO', 'REEMPLAZADO'],
  APROBADO: [],
  RECHAZADO: [],
  REEMPLAZADO: [],
  ANULADO: [],
};

export const transicionesPresupuestoDesde = (de: EstadoPresupuesto): readonly EstadoPresupuesto[] =>
  TRANSICIONES_PRESUPUESTO[de];

export const puedeTransicionarPresupuesto = (de: EstadoPresupuesto, a: EstadoPresupuesto): boolean =>
  TRANSICIONES_PRESUPUESTO[de].includes(a);

export const esEstadoPresupuestoFinal = (e: EstadoPresupuesto): boolean =>
  TRANSICIONES_PRESUPUESTO[e].length === 0;
