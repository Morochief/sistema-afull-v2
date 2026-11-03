import { z } from 'zod';
import { CODIGOS_TIPO_PERMISO, ESTADOS_PERMISO } from '../machines/permiso.js';

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha AAAA-MM-DD');
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora HH:MM');

export const nuevaSolicitudPermisoSchema = z
  .object({
    // Solo RR.HH. puede cargarla a nombre de otra persona (formulario en papel).
    personaId: z.string().uuid().optional(),
    tipo: z.enum(CODIGOS_TIPO_PERMISO),
    detalleTipo: z.string().trim().max(200).optional(),
    motivo: z.string().trim().min(5, 'Contá el motivo (el formulario lo exige)').max(1000),
    modalidad: z.enum(['HORAS', 'DIAS']),
    fechaDesde: fecha,
    fechaHasta: fecha.optional(),
    horaDesde: hora.optional(),
    horaHasta: hora.optional(),
    comprobanteUrl: z.string().trim().url().max(1000).refine((u) => u.startsWith('https://'), 'El enlace tiene que empezar con https://').optional(),
    claveIdempotencia: z.string().uuid(),
  })
  .superRefine((d, ctx) => {
    if ((d.tipo === 'OTRO' || d.tipo === 'SALUD') && !d.detalleTipo?.trim()) ctx.addIssue({ code: 'custom', path: ['detalleTipo'], message: 'Aclará el tipo' });
    if (d.modalidad === 'HORAS') {
      if (!d.horaDesde || !d.horaHasta) ctx.addIssue({ code: 'custom', path: ['horaDesde'], message: 'Indicá desde y hasta qué hora' });
      else if (d.horaHasta <= d.horaDesde) ctx.addIssue({ code: 'custom', path: ['horaHasta'], message: 'La hora final tiene que ser posterior' });
      if (d.fechaHasta && d.fechaHasta !== d.fechaDesde) ctx.addIssue({ code: 'custom', path: ['fechaHasta'], message: 'Por horas es un solo día' });
    } else {
      if (!d.fechaHasta) ctx.addIssue({ code: 'custom', path: ['fechaHasta'], message: 'Indicá hasta qué día' });
      else if (d.fechaHasta < d.fechaDesde) ctx.addIssue({ code: 'custom', path: ['fechaHasta'], message: 'La fecha final no puede ser anterior' });
      if (d.horaDesde || d.horaHasta) ctx.addIssue({ code: 'custom', path: ['horaDesde'], message: 'Por días no lleva horas' });
    }
  });
export type NuevaSolicitudPermiso = z.infer<typeof nuevaSolicitudPermisoSchema>;

export const transicionPermisoSchema = z
  .object({
    desde: z.enum(ESTADOS_PERMISO),
    a: z.enum(['AUTORIZADA', 'REGISTRADA', 'RECHAZADA', 'ANULADA']),
    comentario: z.string().trim().max(500).optional(),
    conDescuento: z.boolean().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.a === 'RECHAZADA' && !d.comentario?.trim()) ctx.addIssue({ code: 'custom', path: ['comentario'], message: 'Rechazar requiere un motivo' });
    if (d.a === 'REGISTRADA' && d.conDescuento === undefined) ctx.addIssue({ code: 'custom', path: ['conDescuento'], message: 'Indicá si se descuenta del salario' });
  });

export const filtroPermisosSchema = z.object({
  q: z.string().trim().max(100).optional(),
  estado: z.enum(ESTADOS_PERMISO).optional(),
  desde: fecha.optional(),
  hasta: fecha.optional(),
  pagina: z.coerce.number().int().min(1).max(1_000_000).default(1),
});
