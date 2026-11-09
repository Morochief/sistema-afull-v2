import { z } from 'zod';

/** Capacidades atómicas (mismo CHECK que `permiso_capacidad`). Los "roles" son solo combinaciones. */
export const CAPACIDADES = ['admin', 'comercial', 'rrhh', 'diseno', 'taller', 'montaje', 'ver_costos'] as const;
export type Capacidad = (typeof CAPACIDADES)[number];

export const ETIQUETA_CAPACIDAD: Record<Capacidad, string> = {
  admin: 'Administrador (todo)',
  comercial: 'Comercial (clientes, OTs, presupuestos)',
  rrhh: 'RR.HH. (personas, asistencia, permisos)',
  diseno: 'Diseño',
  taller: 'Taller (impresión, corte, armado)',
  montaje: 'Montaje (en la calle)',
  ver_costos: 'Ver costos',
};

const username = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Mínimo 3 caracteres')
  .max(50)
  .regex(/^[a-z0-9._-]+$/, 'Solo letras sin acentos, números, punto, guion y guion bajo');
export const passwordSchema = z
  .string()
  .min(8, 'La contraseña tiene que tener al menos 8 caracteres')
  .max(200)
  .refine((p) => /[a-zA-Z]/.test(p) && /\d/.test(p), 'Usá letras y números');
const capacidades = z.array(z.enum(CAPACIDADES)).min(1, 'Elegí al menos un permiso').max(CAPACIDADES.length);

export const nuevoUsuarioSchema = z.object({ username, password: passwordSchema, capacidades });
export const patchUsuarioSchema = z
  .object({ capacidades: capacidades.optional(), activo: z.boolean().optional() })
  .refine((d) => d.capacidades !== undefined || d.activo !== undefined, 'Nada para cambiar');
export const resetPasswordSchema = z.object({ password: passwordSchema });
export const cambiarMiPasswordSchema = z.object({ actual: z.string().min(1).max(200), nueva: passwordSchema });

export const filtroUsuariosSchema = z.object({
  q: z.string().trim().max(100).optional(),
  activo: z.enum(['true', 'false']).optional(),
  pagina: z.coerce.number().int().min(1).max(100_000).default(1),
});
