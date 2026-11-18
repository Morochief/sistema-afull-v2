import type { Empresa, EmpresaDatoInput, FacturaFila, MedioPago, Pagina, ReciboDetalle, ReciboFila } from '@afull/shared';
import { apiFetch } from './api.js';
import { queryListado, type FiltrosListado } from './api-presupuestos.js';
import { portalFetch } from './api-portal.js';

/** Loop 21: cobranzas (facturas ya emitidas, recibos de dinero y datos de aFull para el encabezado). */
const json = (body: unknown) => ({ body: JSON.stringify(body) });

export type PaginaFacturas = Pagina<FacturaFila> & { saldo_total_gs: number };
export type PaginaRecibos = Pagina<ReciboFila> & { cobrado_total_gs: number };
export type NuevaFacturaInput = { numero: string; clienteId: string; fecha: string; montoGs: number; nota?: string };
export type NuevoReciboInput = {
  clienteId: string; fecha: string; medio: MedioPago; banco?: string; referencia?: string; retencionesGs: number; retencionNumero?: string;
  aplicaciones: { facturaId: string; montoGs: number }[]; nota?: string; claveIdempotencia: string;
};

export const listarFacturas = (f: FiltrosListado) => apiFetch<PaginaFacturas>(`/api/cobranzas/facturas${queryListado(f)}`);
/** Facturas con saldo de un cliente (para armar el recibo): hasta 100, las más viejas primero en pantalla. */
export const facturasConSaldo = async (clienteId: string) => {
  const p1 = await apiFetch<PaginaFacturas>(`/api/cobranzas/facturas?clienteId=${clienteId}&estado=CON_SALDO`);
  return p1.items;
};
export const crearFactura = (d: NuevaFacturaInput) => apiFetch<{ id: string; numero: string }>('/api/cobranzas/facturas', { method: 'POST', ...json(d) });
export const anularFactura = (id: string, motivo: string) =>
  apiFetch<{ id: string }>(`/api/cobranzas/facturas/${id}/anular`, { method: 'POST', ...json({ motivo }) });

export const listarRecibos = (f: FiltrosListado) => apiFetch<PaginaRecibos>(`/api/cobranzas/recibos${queryListado(f)}`);
export const obtenerRecibo = (id: string) => apiFetch<ReciboDetalle>(`/api/cobranzas/recibos/${id}`);
export const crearRecibo = (d: NuevoReciboInput) => apiFetch<ReciboFila>('/api/cobranzas/recibos', { method: 'POST', ...json(d) });
export const anularRecibo = (id: string, motivo: string) =>
  apiFetch<{ id: string }>(`/api/cobranzas/recibos/${id}/anular`, { method: 'POST', ...json({ motivo }) });

export const saldoCliente = (clienteId: string) => apiFetch<{ saldo_gs: number; facturas_pendientes: number }>(`/api/cobranzas/clientes/${clienteId}/saldo`);
export const obtenerEmpresa = () => apiFetch<Empresa | null>('/api/cobranzas/empresa');
export const guardarEmpresa = (d: EmpresaDatoInput) => apiFetch<Empresa>('/api/cobranzas/empresa', { method: 'PUT', ...json(d) });

export const portalRecibos = (t: string, pagina = 1) => portalFetch<PaginaRecibos>(t, `/api/portal/recibos${pagina > 1 ? `?pagina=${pagina}` : ''}`);
export const portalRecibo = (t: string, id: string) => portalFetch<ReciboDetalle>(t, `/api/portal/recibos/${id}`);

/** "321499" o "321.499" → 321499; vacío o inválido → null. Guaraníes sin decimales. */
export function leerGs(s: string): number | null {
  const limpio = s.replace(/[.\s]/g, '');
  if (!/^\d{1,13}$/.test(limpio)) return null;
  return Number(limpio);
}

export const hoyAsuncion = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(new Date());

/** Las consultas de cobranzas usan claves que empiezan con "cobranzas" (listados, saldo, con-saldo). */
export const refrescarCobranzas = (qc: { invalidateQueries: (f: { predicate: (q: { queryKey: readonly unknown[] }) => boolean }) => Promise<void> }) =>
  qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('cobranzas') });
