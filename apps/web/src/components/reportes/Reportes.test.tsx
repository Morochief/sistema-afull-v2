import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const api = { registros: vi.fn(), horas: vi.fn(), prefactura: vi.fn() };
vi.mock('../../lib/api-reportes.js', async (orig) => ({
  ...(await orig<object>()),
  obtenerRegistros: (...a: unknown[]) => api.registros(...a),
  obtenerHoras: (...a: unknown[]) => api.horas(...a),
  obtenerPreFactura: (...a: unknown[]) => api.prefactura(...a),
}));

import { TabRegistros } from './TabRegistros.js';
import { TabHoras } from './TabHoras.js';
import { ResumenPreFactura } from './ResumenPreFactura.js';
import { calcularPrecio } from '../../lib/api-reportes.js';

const conQuery = (n: React.ReactNode) => render(<QueryClientProvider client={new QueryClient()}>{n}</QueryClientProvider>);
const fila = (extra: object) => ({ fecha: '2026-10-10', proyecto: 'PRY-1 · Casetas', ot_id: 'o1', ot_codigo: 'OT-2026-0010', cliente: 'Marilan', concepto: 'MO',
  descripcion: 'Edu · Imprimir lona', hs_inicio: '08:00', hs_fin: '09:00', cantidad: 60, unidad: 'min', precio_unitario: 350, total_gs: 21000, persona_id: 'p1', persona: 'Edu', ...extra });

describe('Loop 20 — Reportes (pantallas)', () => {
  beforeEach(() => Object.values(api).forEach((f) => f.mockReset()));

  it('Registros: filas como el Excel de Juan, totales y el enlace del Excel con los mismos filtros', async () => {
    api.registros.mockResolvedValue({ total: 2, pagina: 1, items: [fila({}), fila({ concepto: 'Insumo', descripcion: 'Lona (desperdicio)', hs_inicio: null, hs_fin: null, cantidad: 0.5, unidad: 'M2', precio_unitario: 18000, total_gs: 9000 })],
      totales: { mano_obra_gs: 21000, insumos_gs: 9000, vehiculos_gs: 0, total_gs: 30000, minutos: 60 } });
    conQuery(<TabRegistros />);
    expect(await screen.findByText('Edu · Imprimir lona')).toBeTruthy();
    expect(screen.getByText('Lona (desperdicio)')).toBeTruthy();
    expect(screen.getByTestId('totales-registros').textContent).toContain('30.000');
    expect(screen.getByTestId('totales-registros').textContent).toContain('1 h');
    fireEvent.change(screen.getByLabelText('Concepto'), { target: { value: 'MO' } });
    await waitFor(() => expect(api.registros).toHaveBeenLastCalledWith(expect.objectContaining({ concepto: 'MO', pagina: 1 })));
    const enlace = screen.getByRole('link', { name: /Descargar Excel/ }) as HTMLAnchorElement;
    expect(enlace.getAttribute('href')).toMatch(/^\/api\/reportes\/registros\.xlsx\?desde=\d{4}-\d{2}-\d{2}&hasta=\d{4}-\d{2}-\d{2}&concepto=MO$/);
  });

  it('Horas para pagar: hh:mm, a pagar y avisos', async () => {
    api.horas.mockResolvedValue({ items: [
      { persona_id: 'p1', persona: 'Edu', segundos: 7200, tramos: 2, total_gs: 42000, sin_tarifa: false, reloj_abierto: false },
      { persona_id: 'p2', persona: 'Nachi', segundos: 3600, tramos: 1, total_gs: 0, sin_tarifa: true, reloj_abierto: true },
    ] });
    conQuery(<TabHoras />);
    expect(await screen.findByText('02:00')).toBeTruthy();
    expect(screen.getAllByText('Gs. 42.000')).toHaveLength(2); // la fila de Edu y el total (Nachi no tiene tarifa)
    expect(screen.getByText(/sin tarifa/i)).toBeTruthy();
    expect(screen.getByText(/reloj abierto/i)).toBeTruthy();
    expect((screen.getByRole('link', { name: /Descargar Excel/ }) as HTMLAnchorElement).getAttribute('href')).toMatch(/^\/api\/reportes\/horas\.xlsx\?desde=/);
  });

  it('Pre-factura: precio = costo ÷ (1 − margen), IVA 10 % y el presupuestado al lado', () => {
    expect(calcularPrecio(144000, 30)).toEqual({ precio: 205714, iva: 20571, total: 226285 });
    render(<ResumenPreFactura p={{ cliente: { nombre: 'Marilan', razon_social: 'Marilan SA', ruc: '80000000-1' }, proyecto: { codigo: 'PRY-1', nombre: 'Casetas' }, desde: null, hasta: null,
      ots: [{ id: 'o1', codigo_ot: 'OT-1', titulo: 'Caseta 1', estado: 'TERMINADO', monto_presupuestado_gs: 200000 }],
      mano_obra_gs: 21000, insumos_gs: 63000, vehiculos_gs: 60000, costo_base_gs: 144000, monto_presupuestado_gs: 200000, registros: [] }} margen={30} />);
    expect(screen.getByTestId('precio-sugerido').textContent).toContain('205.714');
    expect(screen.getByTestId('total-con-iva').textContent).toContain('226.285');
    expect(screen.getByText(/Presupuestado/).parentElement!.textContent).toContain('200.000');
  });
});
