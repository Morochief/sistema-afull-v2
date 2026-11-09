import { z } from 'zod';

/** Fotos y archivos (Loop 4, L4.E3). Cada tipo cuelga de una sola cosa. */
export const TIPOS_ARCHIVO = ['ODOMETRO_INICIO', 'ODOMETRO_FIN', 'EVIDENCIA_PARADA', 'MUESTRA_TAREA', 'COMPROBANTE_PERMISO', 'FOTO_PEDIDO'] as const;
export type TipoArchivo = (typeof TIPOS_ARCHIVO)[number];

export const MIMES_IMAGEN = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MIME_PDF = 'application/pdf';
export type MimeArchivo = (typeof MIMES_IMAGEN)[number] | typeof MIME_PDF;

/** Topes por archivo. Las fotos se achican en el celular (~300 KB); el tope es para lo que llegue sin achicar. */
export const MAX_BYTES_IMAGEN = 5 * 1024 * 1024;
export const MAX_BYTES_PDF = 10 * 1024 * 1024;
/** Cuántos archivos subidos admite cada cosa (una foto de odómetro por momento; el resto, varias). */
export const MAX_POR_REFERENCIA: Record<TipoArchivo, number> = {
  ODOMETRO_INICIO: 1, ODOMETRO_FIN: 1, EVIDENCIA_PARADA: 10, MUESTRA_TAREA: 10, COMPROBANTE_PERMISO: 3, FOTO_PEDIDO: 3,
};

export const maxBytesDe = (mime: string) => (mime === MIME_PDF ? MAX_BYTES_PDF : MAX_BYTES_IMAGEN);
export const extensionDe = (mime: string) => ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' })[mime] ?? null;

const uuid = z.string().uuid();

/**
 * Pedido de subida. La referencia depende del tipo:
 * odómetro → `viajeId` o `claveViaje` (la clave con que se inició: sin señal el celular no sabe el id);
 * evidencia → `paradaId`; muestra → `tareaId`; comprobante → `solicitudId`; pedido → `pedidoId`.
 */
export const solicitarArchivoSchema = z
  .object({
    tipo: z.enum(TIPOS_ARCHIVO),
    mime: z.enum([...MIMES_IMAGEN, MIME_PDF]),
    bytes: z.number().int().min(1, 'Archivo vacío'),
    claveIdempotencia: uuid,
    tomadaAt: z.string().datetime({ offset: true }).optional(),
    viajeId: uuid.optional(),
    claveViaje: uuid.optional(),
    paradaId: uuid.optional(),
    tareaId: uuid.optional(),
    solicitudId: uuid.optional(),
    pedidoId: uuid.optional(),
  })
  .refine((d) => d.mime !== MIME_PDF || d.tipo === 'COMPROBANTE_PERMISO', { message: 'Solo los comprobantes pueden ser PDF', path: ['mime'] })
  .refine((d) => d.bytes <= maxBytesDe(d.mime), { message: 'El archivo es demasiado grande', path: ['bytes'] });
export type SolicitarArchivo = z.infer<typeof solicitarArchivoSchema>;

/** Filtro para listar: exactamente una referencia. */
export const filtroArchivosSchema = z
  .object({ viajeId: uuid.optional(), paradaId: uuid.optional(), tareaId: uuid.optional(), solicitudId: uuid.optional(), pedidoId: uuid.optional() })
  .refine((d) => Object.values(d).filter(Boolean).length === 1, 'Indicá una sola referencia');
export type FiltroArchivos = z.infer<typeof filtroArchivosSchema>;
