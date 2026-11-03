import { z } from 'zod';
import {
  ESTADOS_PRESUPUESTO,
  CONCEPTOS_ITEM_PRESUPUESTO,
  ESTADOS_PROYECTO,
} from '../machines/presupuesto.js';

export const nuevoPresupuestoSchema = z.object({
  clienteId: z.string().uuid('Cliente inválido'),
  titulo: z.string().trim().min(1, 'El título es obligatorio').max(255, 'Título demasiado largo'),
  notas: z.string().trim().optional().nullable(),
  margenPct: z.number().min(0, 'El margen no puede ser negativo').default(35.0),
  validezDias: z.number().int().min(1, 'La validez mínima es de 1 día').default(15),
});

export type NuevoPresupuestoInput = z.infer<typeof nuevoPresupuestoSchema>;

export const patchPresupuestoSchema = z.object({
  titulo: z.string().trim().min(1).max(255).optional(),
  notas: z.string().trim().optional().nullable(),
  margenPct: z.number().min(0).optional(),
  validezDias: z.number().int().min(1).optional(),
  updatedAt: z.string().or(z.date()),
});

export type PatchPresupuestoInput = z.infer<typeof patchPresupuestoSchema>;

export const itemPresupuestoSchema = z.object({
  sucursalId: z.string().uuid('Sucursal inválida').nullable().optional(),
  concepto: z.enum(CONCEPTOS_ITEM_PRESUPUESTO, { message: 'Concepto no válido' }),
  descripcion: z.string().trim().min(1, 'La descripción es obligatoria'),
  cantidad: z.number().positive('La cantidad debe ser mayor a cero'),
  unidad: z.string().trim().min(1).default('UNIDAD'),
  precioUnitarioGs: z.number().min(0, 'El precio unitario no puede ser negativo'),
  orden: z.number().int().optional(),
});

export type ItemPresupuestoInput = z.infer<typeof itemPresupuestoSchema>;

export const patchItemPresupuestoSchema = z.object({
  sucursalId: z.string().uuid('Sucursal inválida').nullable().optional(),
  concepto: z.enum(CONCEPTOS_ITEM_PRESUPUESTO).optional(),
  descripcion: z.string().trim().min(1).optional(),
  cantidad: z.number().positive().optional(),
  unidad: z.string().trim().min(1).optional(),
  precioUnitarioGs: z.number().min(0).optional(),
  activo: z.boolean().optional(),
  orden: z.number().int().optional(),
});

export type PatchItemPresupuestoInput = z.infer<typeof patchItemPresupuestoSchema>;

export const transicionarPresupuestoSchema = z.object({
  desde: z.enum(ESTADOS_PRESUPUESTO),
  comentario: z.string().trim().optional(),
});

export type TransicionarPresupuestoInput = z.infer<typeof transicionarPresupuestoSchema>;

export const cerrarCancelarProyectoSchema = z.object({
  comentario: z.string().trim().optional(),
});

export type CerrarCancelarProyectoInput = z.infer<typeof cerrarCancelarProyectoSchema>;

export const filtroPresupuestosSchema = z.object({
  q: z.string().trim().optional(),
  estado: z.enum(ESTADOS_PRESUPUESTO).optional(),
  clienteId: z.string().uuid().optional(),
  desde: z.string().optional(),
  hasta: z.string().optional(),
  pagina: z.coerce.number().int().min(1).default(1),
});

export const filtroProyectosSchema = z.object({
  q: z.string().trim().optional(),
  estado: z.enum(ESTADOS_PROYECTO).optional(),
  clienteId: z.string().uuid().optional(),
  desde: z.string().optional(),
  hasta: z.string().optional(),
  pagina: z.coerce.number().int().min(1).default(1),
});
