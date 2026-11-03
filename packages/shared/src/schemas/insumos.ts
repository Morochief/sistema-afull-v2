import { z } from 'zod';
import { UNIDADES_INSUMO } from '../formulas/material.js';

const dec4 = (msj: string) => z.number().refine((n) => Number.isFinite(n) && Math.abs(n * 1e4 - Math.round(n * 1e4)) < 1e-6, msj);
const positivo4 = dec4('Hasta 4 decimales').pipe(z.number().positive('Tiene que ser mayor a 0').max(99_999_999));
const clave = z.string().uuid();

export const nuevoInsumoSchema = z.object({
  nombre: z.string().trim().min(2).max(150),
  unidad: z.enum(UNIDADES_INSUMO),
  sector: z.string().trim().max(40).optional(),
  costoUnitarioGs: dec4('Hasta 4 decimales').pipe(z.number().min(0).max(99_999_999_999)),
});
export const patchInsumoSchema = z.object({
  nombre: z.string().trim().min(2).max(150).optional(),
  sector: z.string().trim().max(40).nullable().optional(),
  activo: z.boolean().optional(),
});
export const nuevoPrecioSchema = z.object({ costoUnitarioGs: dec4('Hasta 4 decimales').pipe(z.number().min(0).max(99_999_999_999)) });

export const consumoSchema = z.object({
  otId: z.string().uuid(),
  tareaId: z.string().uuid().optional(),
  insumoId: z.string().uuid(),
  cantidad: positivo4,
  esDesperdicio: z.boolean().default(false),
  nota: z.string().trim().max(500).optional(),
  claveIdempotencia: clave,
});

const medida = dec4('Medidas en metros, hasta 4 decimales').pipe(z.number().positive().max(1000));
export const mermaSchema = z.object({
  otId: z.string().uuid(),
  tareaId: z.string().uuid().optional(),
  insumoId: z.string().uuid(),
  /** Si el desperdicio tiene otro precio en el catálogo (p. ej. "Adhesivo desperdicio"); si no, el mismo insumo. */
  insumoDesperdicioId: z.string().uuid().optional(),
  anchoMaterialM: medida,
  largoUsadoM: medida,
  piezas: z.array(z.object({ anchoM: medida, altoM: medida, cantidad: z.number().int().min(1).max(10_000) })).min(1).max(100),
  claveIdempotencia: clave,
});

export const compartidoSchema = z.object({
  insumoId: z.string().uuid(),
  cantidadTotal: positivo4,
  repartos: z.array(z.object({ otId: z.string().uuid(), m2Piezas: positivo4 })).min(2).max(30),
  nota: z.string().trim().max(500).optional(),
  claveIdempotencia: clave,
});

export const anularConsumoSchema = z.object({ motivo: z.string().trim().min(3).max(500), claveIdempotencia: clave });
