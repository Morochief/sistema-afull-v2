/**
 * Solicitud de permiso (Loop 8), según el formulario de la empresa:
 * solicitante → jefe inmediato (autoriza o rechaza) → RR.HH. (registra con descuento sí/no o rechaza).
 * REGISTRADA, RECHAZADA y ANULADA son finales. El solicitante puede anular mientras está PENDIENTE.
 */
export const ESTADOS_PERMISO = ['PENDIENTE', 'AUTORIZADA', 'REGISTRADA', 'RECHAZADA', 'ANULADA'] as const;
export type EstadoPermiso = (typeof ESTADOS_PERMISO)[number];

const TRANSICIONES: Record<EstadoPermiso, readonly EstadoPermiso[]> = {
  PENDIENTE: ['AUTORIZADA', 'RECHAZADA', 'ANULADA'],
  AUTORIZADA: ['REGISTRADA', 'RECHAZADA'],
  REGISTRADA: [],
  RECHAZADA: [],
  ANULADA: [],
};
export const puedeTransicionarPermiso = (de: EstadoPermiso, a: EstadoPermiso) => TRANSICIONES[de].includes(a);
export const esFinalPermiso = (e: EstadoPermiso) => TRANSICIONES[e].length === 0;

/** Tipos del formulario. `requiereComprobante`: el formulario pide adjuntarlo (aviso, no bloqueo). */
export const TIPOS_PERMISO = {
  RETIRO_ANTICIPADO: { texto: 'Permiso para retirarme antes de horario', requiereComprobante: false },
  LLEGADA_TARDE: { texto: 'Permiso para llegar fuera de mi horario', requiereComprobante: false },
  ESTUDIO: { texto: 'Permiso por razones de estudios', requiereComprobante: false },
  SALUD: { texto: 'Licencia por motivos de salud', requiereComprobante: true },
  NACIMIENTO: { texto: 'Licencia por nacimiento (Ley 5508/16)', requiereComprobante: true },
  MATRIMONIO: { texto: 'Licencia por matrimonio (Ley 3384/07)', requiereComprobante: false },
  FALLECIMIENTO_FAMILIAR: { texto: 'Licencia por fallecimiento de familiar directo', requiereComprobante: false },
  DEFUNCION: { texto: 'Licencia por defunción (Ley 3384/07)', requiereComprobante: false },
  MATERNIDAD_LACTANCIA: { texto: 'Licencia por maternidad o lactancia (Art. 133 CT)', requiereComprobante: false },
  OBLIGACION_LEGAL: { texto: 'Obligación legal (audiencia, votación…)', requiereComprobante: true },
  OTRO: { texto: 'Otro (aclarar)', requiereComprobante: false },
} as const;
export type TipoPermiso = keyof typeof TIPOS_PERMISO;
export const CODIGOS_TIPO_PERMISO = Object.keys(TIPOS_PERMISO) as [TipoPermiso, ...TipoPermiso[]];

/**
 * "Deberá presentarse dentro de las 24 horas del usufructo": se marca (no se bloquea) si se cargó
 * más de 24 h después del inicio del permiso. RR.HH. decide.
 */
export function fueraDePlazo(inicioPermiso: Date, cargadaAt: Date): boolean {
  return cargadaAt.getTime() - inicioPermiso.getTime() > 24 * 3600 * 1000;
}
