import { z } from 'zod';
import { CODIGO_PROCESO, MOTIVOS_CIERRE_INTERVALO, ESTADOS_TAREA } from '../machines/tarea.js';

const proceso = z.string().regex(CODIGO_PROCESO, 'Proceso inválido');

const updatedAtField = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'updatedAt inválido');

const fechaISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha AAAA-MM-DD');
const cantidad = z.number().positive().max(99_999_999_999);
const unidad = z.string().trim().min(1).max(20);
const minutos = z.number().int().min(1).max(10_000);

/** Datos de la hoja de ruta de cada tarea (Loop 11): día de trabajo, cantidad con unidad y tiempo estimado. */
const planTarea = {
  fechaTrabajo: fechaISO.optional(),
  cantidad: cantidad.optional(),
  unidad: unidad.optional(),
  minutosEstimados: minutos.optional(),
};

export const itemTareaEnOTSchema = z.object({
  tipo: proceso,
  descripcion: z.string().trim().min(1).max(2000),
  personaAsignadaId: z.string().uuid().optional(),
  ...planTarea,
});

export const nuevaTareaSchema = itemTareaEnOTSchema;

export const patchTareaSchema = z.object({
  descripcion: z.string().trim().min(1).max(2000).optional(),
  personaAsignadaId: z.string().uuid().nullable().optional(),
  fechaTrabajo: fechaISO.nullable().optional(),
  cantidad: cantidad.nullable().optional(),
  unidad: unidad.nullable().optional(),
  minutosEstimados: minutos.nullable().optional(),
  updatedAt: updatedAtField,
});

export const ESTADOS_HOJA = ['BORRADOR', 'ACTIVA', 'CERRADA'] as const;
export type EstadoHoja = (typeof ESTADOS_HOJA)[number];
export const accionHojaSchema = z.object({
  accion: z.enum(['ACTIVAR', 'CERRAR', 'REABRIR']),
  desde: z.enum(ESTADOS_HOJA),
});
export const notasHojaSchema = z.object({ notas: z.string().trim().max(2000).nullable() });

export const cancelarTareaSchema = z.object({
  desde: z.enum(ESTADOS_TAREA),
  comentario: z.string().trim().min(1).max(1000),
});

export const iniciarTareaSchema = z.object({
  claveIdempotencia: z.string().uuid(),
});

export const pausarTareaSchema = z.object({
  motivo: z.enum(MOTIVOS_CIERRE_INTERVALO),
  claveIdempotencia: z.string().uuid(),
});

/** Procesos de máquina: tienen Merma, Compartido y Tanda compartida (Loop 5 y Loop 12). */
export const TIPOS_CON_MERMA = ['TALLER_IMPRESION', 'PLOTEO', 'TALLER_CORTE', 'REFILADO'] as const;

/** Loop 12: una tanda de máquina para varias OTs; el tiempo se reparte por m² de piezas. */
export const tandaSchema = z.object({
  tareas: z
    .array(z.object({ tareaId: z.string().uuid(), m2Piezas: z.number().positive().max(10000) }))
    .min(2, 'Una tanda necesita al menos 2 tareas')
    .max(10),
  claveIdempotencia: z.string().uuid(),
});

export const finalizarTareaSchema = z.object({
  comentario: z.string().trim().max(1000).optional(),
  claveIdempotencia: z.string().uuid(),
});

export const nuevoProcesoSchema = z.object({
  nombre: z.string().trim().min(2).max(60),
  area: z.enum(['TALLER', 'CALLE', 'DISENO', 'COMERCIAL', 'OTRO']),
});
export const patchProcesoSchema = nuevoProcesoSchema.partial().extend({
  activo: z.boolean().optional(),
  orden: z.number().int().min(0).max(9999).optional(),
});
