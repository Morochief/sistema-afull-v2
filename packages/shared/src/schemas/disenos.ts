import { z } from 'zod';

export const ORIGENES_DISENO = ['CLIENTE', 'DISENADORA'] as const;
export type OrigenDiseno = (typeof ORIGENES_DISENO)[number];
export type EstadoDiseno = 'PENDIENTE' | 'APROBADO' | 'OBSERVADO';

/** El archivo vive en Google Drive: solo se guarda el enlace (https://drive.google.com/… o docs.google.com/…). */
export const subirDisenoSchema = z.object({
  origen: z.enum(ORIGENES_DISENO),
  driveUrl: z
    .string()
    .trim()
    .max(500)
    .regex(/^https:\/\/(drive|docs)\.google\.com\//, 'Pegá el enlace de Google Drive del archivo original'),
  notas: z.string().trim().max(1000).optional(),
});

export const observarDisenoSchema = z.object({
  observacion: z.string().trim().min(1, 'Indicá qué hay que corregir (medidas, textos, colores…)').max(1000),
});

export type DisenoVersion = {
  id: string;
  orden_trabajo_id: string;
  version: number;
  origen: OrigenDiseno;
  drive_url: string;
  notas: string | null;
  subido_por_nombre: string;
  subido_at: string;
  estado: EstadoDiseno;
  revisado_por_nombre: string | null;
  revisado_at: string | null;
  observacion: string | null;
};

/** Fila de las colas (por revisar / para producir): la versión más la OT y el cliente. */
export type DisenoEnCola = DisenoVersion & {
  codigo_ot: string;
  ot_titulo: string;
  ot_estado: string;
  cliente_nombre: string;
  sucursal_nombre: string | null;
};
