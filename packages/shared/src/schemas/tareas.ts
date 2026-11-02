import { z } from 'zod';
import { TIPOS_TAREA, MOTIVOS_CIERRE_INTERVALO, ESTADOS_TAREA } from '../machines/tarea.js';

const updatedAtField = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'updatedAt inválido');

export const itemTareaEnOTSchema = z.object({
  tipo: z.enum(TIPOS_TAREA),
  descripcion: z.string().trim().min(1).max(2000),
  personaAsignadaId: z.string().uuid().optional(),
});

export const nuevaTareaSchema = z.object({
  tipo: z.enum(TIPOS_TAREA),
  descripcion: z.string().trim().min(1).max(2000),
  personaAsignadaId: z.string().uuid().optional(),
});

export const patchTareaSchema = z.object({
  descripcion: z.string().trim().min(1).max(2000).optional(),
  personaAsignadaId: z.string().uuid().nullable().optional(),
  updatedAt: updatedAtField,
});

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

export const finalizarTareaSchema = z.object({
  comentario: z.string().trim().max(1000).optional(),
  claveIdempotencia: z.string().uuid(),
});
