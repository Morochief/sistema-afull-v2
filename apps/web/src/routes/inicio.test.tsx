import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import type { Tablero } from '../lib/api-inicio.js';

// Link como <a> simple: el test mira a dónde lleva cada número, no el router.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, params, children, className }: { to: string; params?: { id: string }; children: ReactNode; className?: string }) => (
    <a href={params ? to.replace('$id', params.id) : to} className={className}>{children}</a>
  ),
}));
const estado = vi.hoisted(() => ({ actual: {} as { data?: unknown; isLoading: boolean; error: unknown } }));
vi.mock('../hooks/useInicio.js', () => ({ useInicio: () => estado.actual }));

import { InicioPage } from './inicio.js';

const base: Tablero = {
  ots_por_estado: { PENDIENTE: 12, EN_DISENO: 1, EN_TALLER: 3, TERMINADO: 2 },
  trabajando_ahora: [{ persona: 'Eduardo', tipo: 'TALLER_IMPRESION', descripcion: 'Impresión lona', ot_id: 'ot-2', codigo_ot: 'OT-2026-0002', cliente: 'Farmacia', hora_inicio: '2026-11-09T12:00:00Z' }],
  atrasadas_total: 14,
  atrasadas: [{ id: 'ot-9', codigo_ot: 'OT-2026-0009', titulo: 'Vinilos', estado: 'EN_TALLER', fecha_prometida: '2026-11-03', cliente: 'Café' }],
  pedidos_nuevos_total: 7,
  pedidos_nuevos: [{ id: 'pe1', numero: 'PED-2026-0001', descripcion: 'Cambiar la lona', created_at: '2026-11-09T12:00:00Z', cliente: 'Farmacia' }],
  disenos_por_verificar: 2,
  presupuestos_enviados: { n: 3, monto_gs: 4_500_000 },
  permisos_pendientes: 1,
  hojas_hoy: [{ id: 'h1', descripcion: 'Montaje casa central', estado: 'PLANIFICADA', chapa: 'AAA 001', paradas: 2, resueltas: 1, cuadrilla: 'Carlos, Gerardo' }],
  mes: { vendido_gs: 4_000_000, costo_gs: 3_000_000, ots: 2 },
};
const indicador = (titulo: string) => screen.getByText(titulo).closest('a')!;

beforeEach(() => { estado.actual = { data: base, isLoading: false, error: null }; });

describe('InicioPage (CA-10.7)', () => {
  it('muestra los TOTALES de pedidos y atrasadas, no el largo de las listas', () => {
    render(<InicioPage />);
    expect(within(indicador('Pedidos nuevos')).getByText('7')).toBeTruthy();
    expect(screen.getByText('OTs atrasadas (14)')).toBeTruthy();
    expect(screen.getByText('Pedidos nuevos del portal (7)')).toBeTruthy();
  });

  it('cada número lleva a su lista filtrada', () => {
    render(<InicioPage />);
    expect(indicador('Pendientes').getAttribute('href')).toBe('/ots?estado=PENDIENTE');
    expect(within(indicador('Pendientes')).getByText('12')).toBeTruthy();
    expect(within(indicador('En montaje')).getByText('0')).toBeTruthy();
    expect(indicador('Pedidos nuevos').getAttribute('href')).toBe('/pedidos?estado=NUEVO');
    expect(indicador('Presupuestos enviados').getAttribute('href')).toBe('/presupuestos?estado=ENVIADO');
    expect(indicador('Permisos pendientes').getAttribute('href')).toBe('/permisos?estado=PENDIENTE');
    expect(screen.getByText('OT-2026-0009').closest('a')!.getAttribute('href')).toBe('/ots/ot-9');
    expect(screen.getByText('Montaje casa central').closest('a')!.getAttribute('href')).toBe('/hojas-ruta/h1');
  });

  it('calcula el margen del mes sobre la venta y muestra quién trabaja y las salidas', () => {
    render(<InicioPage />);
    expect(screen.getByText('25,0 %')).toBeTruthy();
    expect(screen.getByText('Eduardo')).toBeTruthy();
    expect(screen.getByText('1/2 paradas')).toBeTruthy();
    expect(screen.getByText(/sin IVA, esperando respuesta/)).toBeTruthy();
  });

  it('sin permiso de costos (mes null) no dibuja el dinero', () => {
    estado.actual = { data: { ...base, mes: null }, isLoading: false, error: null };
    render(<InicioPage />);
    expect(screen.queryByText('Margen del mes')).toBeNull();
    expect(screen.queryByText('Costo real')).toBeNull();
  });

  it('estados vacíos por bloque', () => {
    estado.actual = { data: { ...base, trabajando_ahora: [], hojas_hoy: [], atrasadas: [], atrasadas_total: 0, pedidos_nuevos: [], pedidos_nuevos_total: 0 }, isLoading: false, error: null };
    render(<InicioPage />);
    expect(screen.getByText('Nadie tiene el cronómetro en marcha.')).toBeTruthy();
    expect(screen.getByText('No hay hojas de ruta para hoy.')).toBeTruthy();
    expect(screen.getByText('Ninguna OT pasó su fecha prometida.')).toBeTruthy();
    expect(screen.getByText('No hay pedidos sin atender.')).toBeTruthy();
  });

  it('cargando y error', () => {
    estado.actual = { data: undefined, isLoading: true, error: null };
    const { unmount } = render(<InicioPage />);
    expect(screen.getByText('Cargando el tablero…')).toBeTruthy();
    unmount();
    estado.actual = { data: undefined, isLoading: false, error: new Error('caída') };
    render(<InicioPage />);
    expect(screen.getByText(/caída|No se pudo cargar el tablero/)).toBeTruthy();
  });
});
