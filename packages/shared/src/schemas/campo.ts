import { z } from 'zod';

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (AAAA-MM-DD)');
const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);
const km = z
  .number()
  .min(0, 'Los km no pueden ser negativos')
  .max(9_999_999, 'Odómetro fuera de rango')
  .refine((n) => Math.abs(n * 10 - Math.round(n * 10)) < 1e-6, 'El odómetro admite 1 decimal');
const clave = z.string().uuid('claveIdempotencia inválida');
const texto = (max: number) => z.string().trim().min(1).max(max);

export const ROLES_CUADRILLA = ['CONDUCTOR', 'MONTADOR', 'AYUDANTE'] as const;
export const ESTADOS_HOJA_RUTA = ['PLANIFICADA', 'EN_CURSO', 'FINALIZADA'] as const;
export type EstadoHojaRuta = (typeof ESTADOS_HOJA_RUTA)[number];

export const nuevaSedeSchema = z.object({
  nombre: texto(100),
  gpsLat: z.number().min(-27.7).max(-19.2),
  gpsLng: z.number().min(-62.7).max(-54.2),
  radioM: z.number().int().min(20).max(1000).default(100),
});
export const patchSedeSchema = nuevaSedeSchema.partial().extend({ activo: z.boolean().optional() });

export const nuevoVehiculoSchema = z.object({
  chapa: z.string().trim().min(1).max(20).transform((s) => s.toUpperCase()),
  marcaModelo: texto(100),
  costoKmGs: z.number().min(0).max(99_999_999).default(0),
});
export const patchVehiculoSchema = z.object({
  marcaModelo: texto(100).optional(),
  costoKmGs: z.number().min(0).max(99_999_999).optional(),
  activo: z.boolean().optional(),
});

export const nuevaHojaRutaSchema = z.object({
  fecha,
  descripcion: z.string().trim().max(255).optional(),
  vehiculoId: z.string().uuid().optional(),
});
export const personaHojaRutaSchema = z.object({
  personaId: z.string().uuid(),
  rol: z.enum(ROLES_CUADRILLA).default('MONTADOR'),
});
export const paradaSchema = z.object({
  ordenTrabajoId: z.string().uuid(),
  horaEstimada: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  motivoExtra: z.string().trim().max(1000).optional(),
});

export const iniciarViajeSchema = z.object({
  vehiculoId: z.string().uuid(),
  hojaRutaId: z.string().uuid().optional(),
  kmInicio: km,
  motivoKmInicio: z.string().trim().max(500).optional(),
  gpsLat: lat.optional(),
  gpsLng: lng.optional(),
  claveIdempotencia: clave,
});
export const cerrarViajeSchema = z.object({
  kmFin: km,
  motivoDesvio: z.string().trim().max(1000).optional(),
  gpsLat: lat.optional(),
  gpsLng: lng.optional(),
  claveIdempotencia: clave,
});
export const omitirParadaSchema = z.object({ motivo: texto(1000) });

export const marcarAsistenciaSchema = z.object({
  tipo: z.enum(['ENTRADA', 'SALIDA']),
  gpsLat: lat,
  gpsLng: lng,
  precisionM: z.number().min(0).max(100_000).optional(),
  dispositivoHash: z.string().regex(/^[0-9a-f]{16,64}$/i, 'Huella de dispositivo inválida'),
  claveIdempotencia: clave,
});

export const filtroAsistenciaSchema = z.object({
  q: z.string().trim().max(100).optional(),
  personaId: z.string().uuid().optional(),
  desde: fecha.optional(),
  hasta: fecha.optional(),
  soloFuera: z.enum(['true', 'false']).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
});
