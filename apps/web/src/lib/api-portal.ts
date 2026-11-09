import type { Pagina } from '@afull/shared';
import { apiFetch, ErrorApi } from './api.js';
import { queryListado, type FiltrosListado } from './api-presupuestos.js';

// ---------- Lado del cliente (portal público): token en el header, sin cookies ni redirección al login ----------

export type PortalYo = { cliente: string; para: string; expira_at: string; sucursales: { id: string; nombre: string }[] };
export type PortalOT = { id: string; codigo_ot: string; titulo: string; sucursal: string | null; estado: string; fecha_prometida: string | null; created_at: string };
export type PortalPedido = {
  id: string; numero: string; sucursal: string | null; descripcion: string; foto_url: string | null; estado: 'NUEVO' | 'CONVERTIDO' | 'DESCARTADO';
  motivo_descarte: string | null; created_at: string; codigo_ot: string | null; estado_ot: string | null; presupuesto_numero: string | null; presupuesto_estado: string | null; fotos: number;
};

const CLAVE = 'afull_portal_token';
/** El enlace trae el token en el fragmento (#t=…), que no viaja al servidor; se guarda en la pestaña y se borra de la barra. */
export function tomarTokenDelEnlace(): string | null {
  const m = /[#&]t=([A-Za-z0-9_-]{20,100})/.exec(window.location.hash);
  if (m) {
    try { sessionStorage.setItem(CLAVE, m[1]); } catch { /* sin almacenamiento: vive en memoria */ }
    window.history.replaceState(null, '', window.location.pathname);
    return m[1];
  }
  try { return sessionStorage.getItem(CLAVE); } catch { return null; }
}

export async function portalFetch<T>(token: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(path, {
      method: init.method ?? 'GET',
      credentials: 'omit',
      headers: { authorization: `Portal ${token}`, ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ErrorApi(0, 'No se pudo conectar. Revisá tu conexión.');
  }
  const cuerpo = await r.json().catch(() => null);
  if (!r.ok) throw new ErrorApi(r.status, cuerpo?.error ?? 'Ocurrió un error', cuerpo?.detalle);
  return cuerpo as T;
}

export const portalYo = (t: string) => portalFetch<PortalYo>(t, '/api/portal/yo');
export const portalOTs = (t: string, pagina = 1) => portalFetch<Pagina<PortalOT>>(t, `/api/portal/ots${pagina > 1 ? `?pagina=${pagina}` : ''}`);
export const portalPedidos = (t: string, pagina = 1) => portalFetch<Pagina<PortalPedido>>(t, `/api/portal/pedidos${pagina > 1 ? `?pagina=${pagina}` : ''}`);
export const portalNuevoPedido = (t: string, d: { sucursalId?: string; descripcion: string; fotoUrl?: string; claveIdempotencia: string }) =>
  portalFetch<{ id: string; numero: string }>(t, '/api/portal/pedidos', { method: 'POST', body: d });

// ---------- Lado de Comercial ----------

export type AccesoPortal = { id: string; descripcion: string; activo: boolean; vigente: boolean; expira_at: string; ultimo_uso_at: string | null; created_at: string };
export type PedidoFila = PortalPedido & {
  cliente_id: string; cliente_nombre: string; sucursal_id: string | null; sucursal_nombre: string | null; resuelto_at: string | null;
  orden_trabajo_id: string | null; presupuesto_id: string | null; cargado_por_contacto: string | null;
};
const json = (body: unknown) => ({ body: JSON.stringify(body) });

export const accesosDeCliente = (clienteId: string) => apiFetch<AccesoPortal[]>(`/api/portal-accesos/cliente/${clienteId}`);
export const crearAccesoPortal = (d: { clienteId: string; descripcion: string; diasVigencia?: number }) =>
  apiFetch<{ id: string; token: string; expira_at: string }>('/api/portal-accesos', { method: 'POST', ...json(d) });
export const revocarAccesoPortal = (id: string) => apiFetch<{ id: string }>(`/api/portal-accesos/${id}/revocar`, { method: 'POST' });
export const enlacePortal = (token: string) => `${window.location.origin}/portal#t=${token}`;

export const listarPedidos = (f: FiltrosListado) => apiFetch<Pagina<PedidoFila>>(`/api/pedidos${queryListado(f)}`);
export const convertirPedido = (id: string, a: 'OT' | 'PRESUPUESTO', titulo?: string) =>
  apiFetch<{ id: string; orden_trabajo_id: string | null; presupuesto_id: string | null }>(`/api/pedidos/${id}/convertir`, { method: 'POST', ...json({ a, titulo }) });
export const descartarPedido = (id: string, motivo: string) => apiFetch<{ id: string }>(`/api/pedidos/${id}/descartar`, { method: 'POST', ...json({ motivo }) });
