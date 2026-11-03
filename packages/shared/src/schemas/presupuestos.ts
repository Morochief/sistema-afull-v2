import { z } from 'zod';
import {
  ESTADOS_PRESUPUESTO,
  CONCEPTOS_ITEM_PRESUPUESTO,
  ESTADOS_PROYECTO,
} from '../machines/presupuesto.js';

/** Número con a lo sumo `escala` decimales (la base es NUMERIC y redondearía en silencio). */
const decimal = (escala: number, mensaje: string) =>
  z.number().refine((n) => Number.isFinite(n) && Math.abs(n * 10 ** escala - Math.round(n * 10 ** escala)) < 1e-6, mensaje);

const margen = decimal(2, 'El margen admite hasta 2 decimales').pipe(
  z.number().min(0, 'El margen no puede ser negativo').max(99.99, 'El margen sobre la venta tiene que ser menor a 100 %')
);
const cantidad = decimal(4, 'La cantidad admite hasta 4 decimales').pipe(
  z.number().positive('La cantidad debe ser mayor a cero').max(99_999_999, 'Cantidad demasiado alta')
);
const precio = decimal(4, 'El precio admite hasta 4 decimales').pipe(
  z.number().min(0, 'El precio unitario no puede ser negativo').max(99_999_999_999, 'Precio demasiado alto')
);

export const nuevoPresupuestoSchema = z.object({
  clienteId: z.string().uuid('Cliente inválido'),
  titulo: z.string().trim().min(1, 'El título es obligatorio').max(255, 'Título demasiado largo'),
  notas: z.string().trim().optional().nullable(),
  margenPct: margen.default(30.0),
  validezDias: z.number().int().min(1, 'La validez mínima es de 1 día').max(365).default(15),
});

export type NuevoPresupuestoInput = z.infer<typeof nuevoPresupuestoSchema>;

export const patchPresupuestoSchema = z.object({
  titulo: z.string().trim().min(1).max(255).optional(),
  notas: z.string().trim().optional().nullable(),
  margenPct: margen.optional(),
  /** Precio final sin IVA redondeado a mano (null = usar el calculado). */
  precioFinalGs: z.number().int().positive().max(99_999_999_999).nullable().optional(),
  validezDias: z.number().int().min(1).max(365).optional(),
  updatedAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'updatedAt inválido'),
});

export type PatchPresupuestoInput = z.infer<typeof patchPresupuestoSchema>;

export const itemPresupuestoSchema = z.object({
  sucursalId: z.string().uuid('Sucursal inválida').nullable().optional(),
  concepto: z.enum(CONCEPTOS_ITEM_PRESUPUESTO, { message: 'Concepto no válido' }),
  descripcion: z.string().trim().min(1, 'La descripción es obligatoria').max(2000),
  cantidad,
  unidad: z.string().trim().min(1).max(20).default('UNIDAD'),
  precioUnitarioGs: precio,
  orden: z.number().int().optional(),
});

export type ItemPresupuestoInput = z.infer<typeof itemPresupuestoSchema>;

export const patchItemPresupuestoSchema = z.object({
  sucursalId: z.string().uuid('Sucursal inválida').nullable().optional(),
  concepto: z.enum(CONCEPTOS_ITEM_PRESUPUESTO).optional(),
  descripcion: z.string().trim().min(1).max(2000).optional(),
  cantidad: cantidad.optional(),
  unidad: z.string().trim().min(1).max(20).optional(),
  precioUnitarioGs: precio.optional(),
  activo: z.boolean().optional(),
  orden: z.number().int().optional(),
});

export type PatchItemPresupuestoInput = z.infer<typeof patchItemPresupuestoSchema>;

export const transicionarPresupuestoSchema = z.object({
  desde: z.enum(ESTADOS_PRESUPUESTO),
  comentario: z.string().trim().max(1000).optional(),
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
