import { z } from 'zod';
import { ESTADOS_OT } from '../machines/ot.js';

const fechaISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const sucursalSchema = z.object({
  nombre: z.string().trim().min(1).max(255),
  ciudad: z.string().trim().max(100).optional(),
  direccion: z.string().trim().max(500).optional(),
  gpsLat: z.number().min(-27.7).max(-19.2),
  gpsLng: z.number().min(-62.7).max(-54.2),
});

export const nuevaOTSchema = z.object({
  clienteId: z.string().uuid(),
  sucursalId: z.string().uuid().optional(),
  titulo: z.string().trim().min(1).max(255),
  descripcion: z.string().trim().max(5000).optional(),
  fechaPrometida: fechaISO.optional(),
});

export const transicionSchema = z.object({
  desde: z.enum(ESTADOS_OT),
  a: z.enum(ESTADOS_OT),
  comentario: z.string().trim().max(1000).optional(),
});

export const patchOTSchema = z.object({
  titulo: z.string().trim().min(1).max(255).optional(),
  descripcion: z.string().trim().max(5000).optional(),
  fechaPrometida: fechaISO.optional(),
  sucursalId: z.string().uuid().nullable().optional(),
});

export const filtroOTSchema = z.object({
  q: z.string().trim().max(100).optional(),
  estado: z.enum(ESTADOS_OT).optional(),
  desde: fechaISO.optional(),
  hasta: fechaISO.optional(),
});
