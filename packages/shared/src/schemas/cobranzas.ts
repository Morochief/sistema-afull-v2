import { z } from 'zod';

/** Loop 21: recibos de dinero y cobranzas (docs/LOOP_21_RECIBOS_DISENO.md). */
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha AAAA-MM-DD');
const gs = z.number().int('Guaraníes sin decimales').max(1_000_000_000_000);
const opcional = (max: number) => z.string().trim().max(max).optional().transform((s) => (s ? s : undefined));

export const MEDIOS_PAGO = ['EFECTIVO', 'TRANSFERENCIA', 'CHEQUE', 'TARJETA', 'BILLETERA', 'DEBITO_AUTOMATICO', 'OTRO'] as const;
export type MedioPago = (typeof MEDIOS_PAGO)[number];
export const ETIQUETA_MEDIO: Record<MedioPago, string> = {
  EFECTIVO: 'Efectivo', TRANSFERENCIA: 'Transferencia', CHEQUE: 'Cheque', TARJETA: 'Tarjeta',
  BILLETERA: 'Billetera / Tpago', DEBITO_AUTOMATICO: 'Débito automático', OTRO: 'Otro',
};
export const ESTADOS_FACTURA = ['PENDIENTE', 'PARCIAL', 'PAGADA', 'ANULADA'] as const;
export type EstadoFactura = (typeof ESTADOS_FACTURA)[number];

export const empresaDatoSchema = z.object({
  razonSocial: z.string().trim().min(2).max(150),
  ruc: z.string().trim().regex(/^\d{3,10}-\d$/, 'RUC con dígito verificador (ej. 80012345-6)'),
  direccion: opcional(200),
  ciudad: opcional(80),
  telefono: opcional(60),
  email: z.string().trim().email().max(120).optional().or(z.literal('').transform(() => undefined)),
});

export const nuevaFacturaSchema = z.object({
  numero: z.string().trim().regex(/^\d{3}-\d{3}-\d{7}$/, 'Número 001-001-0000123'),
  clienteId: z.string().uuid(),
  fecha,
  montoGs: gs.positive('El monto tiene que ser mayor a cero'),
  ordenTrabajoId: z.string().uuid().optional(),
  proyectoId: z.string().uuid().optional(),
  nota: opcional(500),
});

export const anularSchema = z.object({ motivo: z.string().trim().min(3, 'Escribí el motivo').max(300) });

export const nuevoReciboSchema = z.object({
  clienteId: z.string().uuid(),
  fecha,
  medio: z.enum(MEDIOS_PAGO),
  banco: opcional(80),
  referencia: opcional(80),
  retencionesGs: gs.min(0).default(0),
  retencionNumero: opcional(30),
  aplicaciones: z.array(z.object({ facturaId: z.string().uuid(), montoGs: gs.positive() })).min(1, 'Elegí al menos una factura').max(50)
    .refine((a) => new Set(a.map((x) => x.facturaId)).size === a.length, 'Una factura aparece dos veces'),
  nota: opcional(500),
  claveIdempotencia: z.string().uuid(),
});

export const filtroFacturasSchema = z.object({
  q: z.string().trim().optional(),
  estado: z.enum([...ESTADOS_FACTURA, 'TODAS', 'CON_SALDO']).default('CON_SALDO'),
  clienteId: z.string().uuid().optional(),
  desde: fecha.optional(),
  hasta: fecha.optional(),
  pagina: z.coerce.number().int().min(1).max(1_000_000).catch(1),
});

export const filtroRecibosSchema = z.object({
  q: z.string().trim().optional(),
  estado: z.enum(['VIGENTE', 'ANULADO', 'TODOS']).default('TODOS'),
  clienteId: z.string().uuid().optional(),
  desde: fecha.optional(),
  hasta: fecha.optional(),
  pagina: z.coerce.number().int().min(1).max(1_000_000).catch(1),
});

export type EmpresaDatoInput = z.infer<typeof empresaDatoSchema>;
export type NuevaFactura = z.infer<typeof nuevaFacturaSchema>;
export type NuevoRecibo = z.infer<typeof nuevoReciboSchema>;
export type FiltroFacturas = z.infer<typeof filtroFacturasSchema>;
export type FiltroRecibos = z.infer<typeof filtroRecibosSchema>;

export type Empresa = { razon_social: string; ruc: string; direccion: string | null; ciudad: string | null; telefono: string | null; email: string | null };
export type FacturaFila = {
  id: string; numero: string; cliente_id: string; cliente_nombre: string; fecha: string; monto_gs: number; cobrado_gs: number;
  saldo_gs: number; estado: EstadoFactura; nota: string | null; motivo_anulacion: string | null;
};
export type ReciboFila = {
  id: string; numero: string; cliente_id: string; cliente_nombre: string; fecha: string; importe_gs: number; retenciones_gs: number;
  medio: MedioPago; anulado_at: string | null;
};
export type ReciboDetalle = ReciboFila & {
  retencion_numero: string | null; banco: string | null; referencia: string | null; cobrador_nombre: string; created_at: string;
  motivo_anulacion: string | null; nota?: string | null; monto_letras: string;
  cliente: { nombre: string; ruc: string | null };
  empresa: Empresa | null;
  aplicaciones: { factura_id: string; numero: string; fecha: string; monto_factura_gs: number; monto_gs: number }[];
};
