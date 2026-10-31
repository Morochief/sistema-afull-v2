export const ESTADOS_OT = [
  'PENDIENTE',
  'EN_DISENO',
  'EN_TALLER',
  'EN_MONTAJE',
  'TERMINADO',
  'CANCELADO',
] as const;

export type EstadoOT = (typeof ESTADOS_OT)[number];

const TRANSICIONES: Record<EstadoOT, readonly EstadoOT[]> = {
  PENDIENTE: ['EN_DISENO', 'EN_TALLER', 'CANCELADO'],
  EN_DISENO: ['EN_TALLER', 'CANCELADO'],
  EN_TALLER: ['EN_MONTAJE', 'TERMINADO', 'CANCELADO'],
  EN_MONTAJE: ['TERMINADO', 'CANCELADO'],
  TERMINADO: [],
  CANCELADO: [],
};

export const transicionesDesde = (de: EstadoOT): readonly EstadoOT[] => TRANSICIONES[de];
export const puedeTransicionar = (de: EstadoOT, a: EstadoOT): boolean => TRANSICIONES[de].includes(a);
