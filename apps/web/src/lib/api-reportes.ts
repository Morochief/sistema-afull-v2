import { apiFetch } from './api.js';

/** Loop 20: reportes (registros como el Excel de Juan, horas para pagar y pre-factura). */
export type FilaRegistro = {
  fecha: string; proyecto: string | null; ot_id: string; ot_codigo: string; cliente: string; concepto: 'MO' | 'Insumo' | 'Vehículo';
  descripcion: string; hs_inicio: string | null; hs_fin: string | null; cantidad: number; unidad: string; precio_unitario: number; total_gs: number;
  persona_id: string | null; persona: string | null;
};
export type Totales = { mano_obra_gs: number; insumos_gs: number; vehiculos_gs: number; total_gs: number; minutos: number };
export type FiltroRegistros = { desde: string; hasta: string; clienteId?: string; proyectoId?: string; personaId?: string; concepto?: '' | 'MO' | 'INSUMO' | 'VEHICULO'; pagina: number };
export type HorasPersona = { persona_id: string; persona: string; segundos: number; tramos: number; total_gs: number; sin_tarifa: boolean; reloj_abierto: boolean };
export type PreFactura = {
  cliente: { nombre: string; razon_social: string | null; ruc: string | null }; proyecto: { codigo: string; nombre: string } | null;
  desde: string | null; hasta: string | null;
  ots: { id: string; codigo_ot: string; titulo: string; estado: string; monto_presupuestado_gs: number | null }[];
  mano_obra_gs: number; insumos_gs: number; vehiculos_gs: number; costo_base_gs: number; monto_presupuestado_gs: number | null; registros: FilaRegistro[];
};
export type FiltroPreFactura = { proyectoId?: string; clienteId?: string; desde?: string; hasta?: string };

/** Query string sin los vacíos, en el orden dado (también arma el enlace del Excel). */
export function query(p: Record<string, string | number | undefined>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== '') s.set(k, String(v));
  return s.toString();
}
const filtroQ = (f: Omit<FiltroRegistros, 'pagina'>) => query({ desde: f.desde, hasta: f.hasta, clienteId: f.clienteId, proyectoId: f.proyectoId, personaId: f.personaId, concepto: f.concepto });

export const obtenerRegistros = (f: FiltroRegistros) =>
  apiFetch<{ items: FilaRegistro[]; total: number; pagina: number; totales: Totales }>(`/api/reportes/registros?${filtroQ(f)}${f.pagina > 1 ? `&pagina=${f.pagina}` : ''}`);
export const urlExcelRegistros = (f: Omit<FiltroRegistros, 'pagina'>) => `/api/reportes/registros.xlsx?${filtroQ(f)}`;
export const obtenerHoras = (desde: string, hasta: string) => apiFetch<{ items: HorasPersona[] }>(`/api/reportes/horas?${query({ desde, hasta })}`);
export const urlExcelHoras = (desde: string, hasta: string) => `/api/reportes/horas.xlsx?${query({ desde, hasta })}`;
export const obtenerPreFactura = (f: FiltroPreFactura) => apiFetch<PreFactura>(`/api/reportes/prefactura?${query(f)}`);

/** Precio con margen sobre la venta, como el presupuesto: precio = costo ÷ (1 − margen); IVA 10 %. */
export function calcularPrecio(costo: number, margenPct: number) {
  const m = Math.min(Math.max(margenPct, 0), 95) / 100;
  const precio = Math.round(costo / (1 - m));
  const iva = Math.round(precio * 0.1);
  return { precio, iva, total: precio + iva };
}

/** "02:00" a partir de minutos o segundos. */
export const hhmm = (minutos: number) => `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(Math.round(minutos % 60)).padStart(2, '0')}`;
export const fechaAsuncion = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(d);
/** Del 1 del mes a hoy. */
export function mesActual() {
  const hoy = fechaAsuncion(new Date());
  return { desde: `${hoy.slice(0, 8)}01`, hasta: hoy };
}
