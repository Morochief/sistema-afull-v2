import { z } from 'zod';

const fechaISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)');
const updatedAtField = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'updatedAt inválido');

export const nuevaPersonaSchema = z.object({
  nombre: z.string().trim().min(1).max(150),
  ci: z.string().trim().min(1).max(30),
  cargo: z.string().trim().max(100).optional(),
  departamento: z.string().trim().max(100).optional(),
});

export const patchPersonaSchema = z.object({
  nombre: z.string().trim().min(1).max(150).optional(),
  ci: z.string().trim().min(1).max(30).optional(),
  cargo: z.string().trim().max(100).nullable().optional(),
  departamento: z.string().trim().max(100).nullable().optional(),
  updatedAt: updatedAtField,
});

export const vincularUsuarioSchema = z.object({
  usuarioId: z.string().uuid().nullable(),
});

export const nuevaTarifaSchema = z
  .object({
    tarifaHoraGs: z.number().positive('La tarifa por hora debe ser mayor a 0'),
    fechaInicio: fechaISO,
    fechaFin: fechaISO.optional(),
  })
  .refine((data) => !data.fechaFin || data.fechaFin >= data.fechaInicio, {
    message: 'La fecha de fin debe ser posterior o igual a la fecha de inicio',
    path: ['fechaFin'],
  });

export const cerrarTarifaSchema = z.object({
  fechaFin: fechaISO,
});
