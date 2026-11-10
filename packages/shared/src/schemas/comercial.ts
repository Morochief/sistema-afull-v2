import { z } from 'zod';
import { ESTADOS_OT } from '../machines/ot.js';
import { itemTareaEnOTSchema } from './tareas.js';

const fechaISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const updatedAtField = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'updatedAt inválido');

export const nuevoClienteSchema = z.object({
  nombre: z.string().trim().min(1).max(255),
  razonSocial: z.string().trim().max(255).optional(),
  ruc: z.string().trim().max(30).optional(),
  telefono: z.string().trim().max(50).optional(),
  email: z.string().trim().email().max(255).optional(),
});

export const patchClienteSchema = z.object({
  nombre: z.string().trim().min(1).max(255).optional(),
  razonSocial: z.string().trim().max(255).nullable().optional(),
  ruc: z.string().trim().max(30).nullable().optional(),
  telefono: z.string().trim().max(50).nullable().optional(),
  email: z.string().trim().email().max(255).nullable().optional(),
  updatedAt: updatedAtField,
});

export const estadoConTimestampSchema = z.object({
  activo: z.boolean(),
  updatedAt: updatedAtField,
});

export const estadoSimpleSchema = z.object({
  activo: z.boolean(),
});

export const filtroClienteSchema = z.object({
  q: z.string().trim().max(100).optional(),
  activo: z.enum(['true', 'false']).optional(),
  desde: fechaISO.optional(),
  hasta: fechaISO.optional(),
});

export const sucursalSchema = z.object({
  nombre: z.string().trim().min(1).max(255),
  ciudad: z.string().trim().max(100).optional(),
  direccion: z.string().trim().max(500).optional(),
  gpsLat: z.number().min(-27.7).max(-19.2),
  gpsLng: z.number().min(-62.7).max(-54.2),
});

export const patchSucursalSchema = z.object({
  nombre: z.string().trim().min(1).max(255).optional(),
  ciudad: z.string().trim().max(100).nullable().optional(),
  direccion: z.string().trim().max(500).nullable().optional(),
  gpsLat: z.number().min(-27.7).max(-19.2).optional(),
  gpsLng: z.number().min(-62.7).max(-54.2).optional(),
  updatedAt: updatedAtField,
});

export const contactoSchema = z.object({
  nombre: z.string().trim().min(1).max(150),
  cargo: z.string().trim().max(100).optional(),
  telefono: z.string().trim().max(50).optional(),
  email: z.string().trim().email().max(255).optional(),
  esPrincipal: z.boolean().optional(),
});

export const patchContactoSchema = z.object({
  nombre: z.string().trim().min(1).max(150).optional(),
  cargo: z.string().trim().max(100).nullable().optional(),
  telefono: z.string().trim().max(50).nullable().optional(),
  email: z.string().trim().email().max(255).nullable().optional(),
  esPrincipal: z.boolean().optional(),
});

export const marcaSchema = z.object({
  nombre: z.string().trim().min(1).max(100),
});

export const patchMarcaSchema = z.object({
  nombre: z.string().trim().min(1).max(100),
});

export const nuevaOTSchema = z.object({
  clienteId: z.string().uuid(),
  sucursalId: z.string().uuid().optional(),
  titulo: z.string().trim().min(1).max(255),
  descripcion: z.string().trim().max(5000).optional(),
  fechaPrometida: fechaISO.optional(),
  tareas: z.array(itemTareaEnOTSchema).max(30).optional(),
  /** Urgencias: la hoja de ruta nace activa y los operarios ven las tareas enseguida (Loop 11). */
  activarHoja: z.boolean().optional(),
});

export const transicionSchema = z.object({
  desde: z.enum(ESTADOS_OT),
  a: z.enum(ESTADOS_OT),
  comentario: z.string().trim().max(1000).optional(),
});

export const patchOTSchema = z.object({
  titulo: z.string().trim().min(1).max(255).optional(),
  descripcion: z.string().trim().max(5000).nullable().optional(),
  fechaPrometida: fechaISO.nullable().optional(),
  sucursalId: z.string().uuid().nullable().optional(),
  updatedAt: updatedAtField,
});

export const filtroOTSchema = z.object({
  q: z.string().trim().max(100).optional(),
  estado: z.enum(ESTADOS_OT).optional(),
  clienteId: z.string().uuid().optional(),
  desde: fechaISO.optional(),
  hasta: fechaISO.optional(),
});
