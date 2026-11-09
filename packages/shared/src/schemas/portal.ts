import { z } from 'zod';

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha AAAA-MM-DD');
const https = z.string().trim().url().max(1000).refine((u) => u.startsWith('https://'), 'El enlace tiene que empezar con https://');

/** Comercial genera un enlace para un contacto del cliente. Vence (por defecto en 180 días). */
export const nuevoAccesoPortalSchema = z.object({
  clienteId: z.string().uuid(),
  descripcion: z.string().trim().min(2, 'Decí para quién es el enlace').max(150),
  diasVigencia: z.number().int().min(1).max(730).default(180),
});

/** El cliente pide un trabajo para uno de sus locales (o sin local). */
export const nuevoPedidoPortalSchema = z.object({
  sucursalId: z.string().uuid().optional(),
  descripcion: z.string().trim().min(5, 'Contanos qué necesitás').max(2000),
  fotoUrl: https.optional(),
  claveIdempotencia: z.string().uuid(),
});

export const filtroPedidosSchema = z.object({
  q: z.string().trim().max(100).optional(),
  estado: z.enum(['NUEVO', 'CONVERTIDO', 'DESCARTADO']).optional(),
  desde: fecha.optional(),
  hasta: fecha.optional(),
  pagina: z.coerce.number().int().min(1).max(1_000_000).default(1),
});

export const convertirPedidoSchema = z.object({
  a: z.enum(['OT', 'PRESUPUESTO']),
  titulo: z.string().trim().min(1).max(255).optional(),
});
export const descartarPedidoSchema = z.object({ motivo: z.string().trim().min(3, 'Indicá el motivo').max(500) });

/** Cómo ve el cliente el estado de su OT (sin jerga interna). */
export const ESTADO_OT_CLIENTE: Record<string, string> = {
  PENDIENTE: 'Recibido', EN_DISENO: 'En diseño', EN_TALLER: 'En producción', EN_MONTAJE: 'En instalación', TERMINADO: 'Terminado', CANCELADO: 'Cancelado',
};

export type TonoEstadoPedido = 'neutral' | 'warning' | 'success' | 'danger';
export type SeguimientoPedido = {
  estado: string; motivo_descarte?: string | null;
  codigo_ot: string | null; estado_ot: string | null;
  presupuesto_numero: string | null; presupuesto_estado: string | null;
};
const tonoOT = (e: string | null): TonoEstadoPedido => (e === 'TERMINADO' ? 'success' : e === 'CANCELADO' ? 'danger' : e === 'PENDIENTE' ? 'neutral' : 'warning');

/**
 * Texto que ve el cliente para su pedido (docs/LOOP_9_DISENO.md §6). La API ya resuelve qué OT sigue el pedido
 * (directa o nacida del presupuesto vigente) y en qué estado está el presupuesto vigente.
 */
export function estadoPedidoCliente(p: SeguimientoPedido): { texto: string; tono: TonoEstadoPedido } {
  if (p.estado === 'DESCARTADO') return { texto: 'No se realizará', tono: 'danger' };
  if (p.codigo_ot) return { texto: ESTADO_OT_CLIENTE[p.estado_ot ?? ''] ?? 'En curso', tono: tonoOT(p.estado_ot) };
  if (p.presupuesto_estado === 'RECHAZADO' || p.presupuesto_estado === 'ANULADO') return { texto: 'No se realizará', tono: 'danger' };
  if (p.presupuesto_numero) return { texto: 'Presupuestando', tono: 'warning' };
  return { texto: 'Recibido', tono: 'neutral' };
}
