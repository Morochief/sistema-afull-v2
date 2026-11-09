import { apiFetch } from './api.js';

export type TrabajandoAhora = { persona: string; tipo: string; descripcion: string; ot_id: string; codigo_ot: string; cliente: string; hora_inicio: string };
export type OTAtrasada = { id: string; codigo_ot: string; titulo: string; estado: string; fecha_prometida: string; cliente: string };
export type PedidoNuevo = { id: string; numero: string; descripcion: string; created_at: string; cliente: string };
export type HojaHoy = { id: string; descripcion: string | null; estado: string; chapa: string | null; paradas: number; resueltas: number; cuadrilla: string | null };
export type Tablero = {
  ots_por_estado: Record<string, number>;
  trabajando_ahora: TrabajandoAhora[];
  /** Totales reales; las listas traen como mucho 10 atrasadas y 5 pedidos. */
  atrasadas_total: number;
  atrasadas: OTAtrasada[];
  pedidos_nuevos_total: number;
  pedidos_nuevos: PedidoNuevo[];
  disenos_por_verificar: number;
  presupuestos_enviados: { n: number; monto_gs: number };
  hojas_hoy: HojaHoy[];
  permisos_pendientes: number;
  /** null si el usuario no puede ver costos. */
  mes: { vendido_gs: number; costo_gs: number; ots: number } | null;
};

export const obtenerTablero = () => apiFetch<Tablero>('/api/inicio');
